import { app, BrowserWindow, safeStorage, screen } from "electron"
import path from "node:path"
import net from "node:net"
import fs from "node:fs"
import crypto from "node:crypto"
import { ChildProcess, fork } from "node:child_process"

// ── Logging ──────────────────────────────────────────────────────────────
// Write all logs to ~/Library/Logs/AutEng HQ/main.log so they're inspectable
const logDir = path.join(app.getPath("logs"))
fs.mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, "main.log")
const logStream = fs.createWriteStream(logFile, { flags: "a" })

function log(...args: unknown[]) {
  const line = `[${new Date().toISOString()}] ${args.map(String).join(" ")}`
  logStream.write(line + "\n")
  console.log(line)
}

log("AutEng HQ starting", { version: app.getVersion(), packaged: app.isPackaged })
log("Log file:", logFile)

// ── Helpers ──────────────────────────────────────────────────────────────
function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, "localhost", () => {
      const addr = server.address() as net.AddressInfo
      server.close(() => resolve(addr.port))
    })
    server.on("error", reject)
  })
}

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let nextServerProcess: ChildProcess | null = null
let nextServerPort: number | null = null

async function createWindow(url: string) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.min(1440, width),
    height: Math.min(900, height),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    show: false,
  })

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show()
  })

  await mainWindow.loadURL(url)

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" })
  }

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

function loadOrCreateMasterKey(dataDir: string): string | null {
  const keyFile = path.join(dataDir, "master.key")

  if (!safeStorage.isEncryptionAvailable()) {
    log("WARNING: safeStorage encryption not available — secrets will not be encrypted")
    return null
  }

  try {
    if (fs.existsSync(keyFile)) {
      const encrypted = fs.readFileSync(keyFile)
      const decrypted = safeStorage.decryptString(encrypted)
      log("Master key loaded from", keyFile)
      return decrypted
    }

    // First launch: generate a new master key
    const masterKey = crypto.randomBytes(32).toString("hex")
    const encrypted = safeStorage.encryptString(masterKey)
    fs.writeFileSync(keyFile, encrypted, { mode: 0o600 })
    log("Master key generated and saved to", keyFile)
    return masterKey
  } catch (err) {
    log("ERROR: Failed to load/create master key:", err instanceof Error ? err.message : String(err))
    return null
  }
}

async function startNextStandaloneServer(): Promise<string> {
  const port = await getRandomPort()
  // extraResources land at process.resourcesPath, not inside asar
  const appBase = path.join(
    process.resourcesPath,
    "app",
    "apps",
    "hq"
  )
  const serverPath = path.join(appBase, "server.js")

  log("Starting Next.js server:", serverPath)
  log("Server CWD:", appBase)
  log("Port:", port)

  // Set HQ_DATA_DIR so the DB goes to a writable location
  const dataDir = path.join(app.getPath("userData"), "data")
  fs.mkdirSync(dataDir, { recursive: true })

  // Load or create master key for secret encryption
  const masterKey = loadOrCreateMasterKey(dataDir)

  return new Promise((resolve, reject) => {
    const childEnv = {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "localhost",
      NODE_ENV: "production" as const,
      HQ_DATA_DIR: dataDir,
      ...(masterKey ? { HQ_MASTER_KEY: masterKey } : {}),
    }

    nextServerProcess = fork(serverPath, [], {
      env: childEnv,
      cwd: appBase,
      silent: true, // capture stdout/stderr
    })

    // Pipe child process output to log file
    nextServerProcess.stdout?.on("data", (data: Buffer) => {
      log("[next:stdout]", data.toString().trim())
    })
    nextServerProcess.stderr?.on("data", (data: Buffer) => {
      log("[next:stderr]", data.toString().trim())
    })

    nextServerProcess.on("exit", (code, signal) => {
      log("[next:exit]", `code=${code} signal=${signal}`)
    })

    const startTime = Date.now()
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${port}`)
        if (res.ok || res.status < 500) {
          clearInterval(interval)
          log("Next.js server ready at", `http://localhost:${port}`)
          nextServerPort = port
          resolve(`http://localhost:${port}`)
        }
      } catch {
        if (Date.now() - startTime > 30_000) {
          clearInterval(interval)
          const err = new Error("Next.js server failed to start within 30s")
          log("ERROR:", err.message)
          reject(err)
        }
      }
    }, 200)

    nextServerProcess.on("error", (err) => {
      log("ERROR: Next.js fork failed:", err.message)
      clearInterval(interval)
      reject(err)
    })
  })
}

app.whenReady().then(async () => {
  let url: string

  if (isDev) {
    url = process.env.NEXT_DEV_URL || "http://localhost:3000"
  } else {
    url = await startNextStandaloneServer()
  }

  log("Loading URL:", url)
  await createWindow(url)

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow(url)
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", async () => {
  log("Shutting down — cleaning up processes...")

  // Signal the Next.js server to clean up managed processes via a shutdown endpoint
  // The ProcessRegistry and managers live in the Next.js process, not in Electron main
  if (nextServerProcess && !nextServerProcess.killed) {
    try {
      // Give the server a chance to clean up (ProcessRegistry.shutdownAll)
      if (nextServerPort) {
        await fetch(`http://localhost:${nextServerPort}/api/processes/shutdown`, {
          method: "POST",
          signal: AbortSignal.timeout(8000),
        }).catch(() => {
          // Endpoint may not exist or server may be shutting down
        })
      }
    } catch {
      // ignore
    }

    nextServerProcess.kill()
  }

  log("Shutdown complete")
})
