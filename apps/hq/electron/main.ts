import { app, BrowserWindow, screen } from "electron"
import path from "node:path"
import { ChildProcess, fork } from "node:child_process"
import { getRandomPort } from "get-port-please"

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let nextServerProcess: ChildProcess | null = null

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

async function startNextStandaloneServer(): Promise<string> {
  const port = await getRandomPort("localhost")
  // standalone output mirrors monorepo structure
  const appBase = path.join(
    app.getAppPath(),
    "app",
    "apps",
    "hq"
  )
  const serverPath = path.join(appBase, "server.js")

  return new Promise((resolve, reject) => {
    nextServerProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: "localhost",
      },
      cwd: appBase,
    })

    const startTime = Date.now()
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${port}`)
        if (res.ok || res.status < 500) {
          clearInterval(interval)
          resolve(`http://localhost:${port}`)
        }
      } catch {
        if (Date.now() - startTime > 30_000) {
          clearInterval(interval)
          reject(new Error("Next.js server failed to start within 30s"))
        }
      }
    }, 200)

    nextServerProcess.on("error", (err) => {
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

app.on("before-quit", () => {
  if (nextServerProcess) {
    nextServerProcess.kill()
  }
})
