import { spawn, type ChildProcess } from "node:child_process"
import { v4 as uuidv4 } from "uuid"
import { RingBuffer } from "./ring-buffer"
import { getProcessRegistry } from "./process-registry"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import type {
  BackgroundProcess,
  BackgroundProcessType,
  BackgroundProcessStatus,
} from "./types"

const BG_MANAGER_KEY = Symbol.for("auteng.bgProcessManager")

export class BackgroundProcessManager {
  private processes = new Map<string, BackgroundProcess>()
  private healthChecks = new Map<string, ReturnType<typeof setInterval>>()

  async start(
    projectId: string,
    processType: BackgroundProcessType,
    command: string,
    args: string[],
    cwd: string,
  ): Promise<BackgroundProcess> {
    const registry = getProcessRegistry()
    const id = uuidv4()
    const ringBuffer = new RingBuffer(500)

    const childProcess = spawn(command, args, {
      cwd,
      stdio: "pipe",
      env: { ...process.env },
    })

    const bgProcess: BackgroundProcess = {
      id,
      projectId,
      type: "background",
      processType,
      command,
      args,
      cwd,
      childProcess,
      ringBuffer,
      status: "running",
      startedAt: new Date(),
      meta: { processType },
    }

    // Register with ProcessRegistry (throws on limit)
    registry.register(bgProcess)
    this.processes.set(id, bgProcess)

    // Pipe output to ring buffer
    childProcess.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean)
      for (const line of lines) {
        ringBuffer.pushLine("stdout", line)
        registry.emit("process:output", { processId: id, stream: "stdout", line })
        this.detectPort(bgProcess, line)
      }
    })

    childProcess.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean)
      for (const line of lines) {
        ringBuffer.pushLine("stderr", line)
        registry.emit("process:output", { processId: id, stream: "stderr", line })
      }
    })

    childProcess.on("exit", (code, signal) => {
      const status: BackgroundProcessStatus =
        code === 0 || signal === "SIGTERM" ? "stopped" : "failed"
      bgProcess.status = status === "stopped" ? "stopped" : "failed"
      this.cleanup(id, status)
    })

    childProcess.on("error", (err) => {
      ringBuffer.pushLine("stderr", `Process error: ${err.message}`)
      bgProcess.status = "failed"
      this.cleanup(id, "failed")
    })

    // Record in DB
    const db = getDb()
    db.insert(schema.backgroundProcesses)
      .values({
        id,
        projectId,
        processType,
        command,
        args: JSON.stringify(args),
        status: "running",
      })
      .run()

    // Start health check for dev servers
    if (processType === "dev_server") {
      this.startHealthCheck(bgProcess)
    }

    return bgProcess
  }

  async stop(processId: string): Promise<void> {
    const bgProcess = this.processes.get(processId)
    if (!bgProcess) return

    await this.gracefulShutdown(bgProcess.childProcess)
    this.cleanup(processId, "stopped")
  }

  async stopAllForProject(projectId: string): Promise<void> {
    const projectProcesses = Array.from(this.processes.values()).filter(
      (p) => p.projectId === projectId,
    )
    await Promise.all(projectProcesses.map((p) => this.stop(p.id)))
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.processes.keys()).map((id) => this.stop(id)),
    )
  }

  getOutput(processId: string, lines = 50): string[] {
    const bgProcess = this.processes.get(processId)
    if (!bgProcess) return []
    return bgProcess.ringBuffer
      .getLast(lines)
      .map((e) => `[${e.stream}] ${e.line}`)
  }

  getProcess(processId: string): BackgroundProcess | undefined {
    return this.processes.get(processId)
  }

  getByProject(projectId: string): BackgroundProcess[] {
    return Array.from(this.processes.values()).filter(
      (p) => p.projectId === projectId,
    )
  }

  getDevServerUrl(projectId: string): string | null {
    const devServer = Array.from(this.processes.values()).find(
      (p) => p.projectId === projectId && p.processType === "dev_server" && p.status === "running",
    )
    return devServer?.url ?? null
  }

  private detectPort(process: BackgroundProcess, line: string): void {
    if (process.processType !== "dev_server" || process.port) return

    // Common patterns: "localhost:3000", "http://localhost:3000", "port 3000"
    const portMatch = line.match(
      /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/,
    ) || line.match(/port\s+(\d{4,5})/i)

    if (portMatch) {
      const port = parseInt(portMatch[1], 10)
      process.port = port
      process.url = `http://localhost:${port}`

      // Update DB
      const db = getDb()
      db.update(schema.backgroundProcesses)
        .set({ port, url: process.url })
        .where(eq(schema.backgroundProcesses.id, process.id))
        .run()
    }
  }

  private startHealthCheck(process: BackgroundProcess): void {
    const interval = setInterval(async () => {
      if (!process.url || process.status !== "running") {
        return
      }
      try {
        await fetch(process.url, { signal: AbortSignal.timeout(5000) })
      } catch {
        // Health check failed — just log, don't kill
        process.ringBuffer.pushLine("stderr", "Health check failed")
      }
    }, 10_000)

    this.healthChecks.set(process.id, interval)
  }

  private async gracefulShutdown(child: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (!child.pid || child.killed) {
        resolve()
        return
      }

      const forceKill = setTimeout(() => {
        try {
          child.kill("SIGKILL")
        } catch {
          // already dead
        }
        resolve()
      }, 8000)

      child.once("exit", () => {
        clearTimeout(forceKill)
        resolve()
      })

      // SIGTERM first, then SIGINT after 5s
      child.kill("SIGTERM")
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGINT")
        }
      }, 5000)
    })
  }

  private cleanup(processId: string, status: BackgroundProcessStatus): void {
    const registry = getProcessRegistry()

    // Clear health check
    const interval = this.healthChecks.get(processId)
    if (interval) {
      clearInterval(interval)
      this.healthChecks.delete(processId)
    }

    // Update DB
    try {
      const db = getDb()
      db.update(schema.backgroundProcesses)
        .set({ status, stoppedAt: new Date().toISOString() })
        .where(eq(schema.backgroundProcesses.id, processId))
        .run()
    } catch {
      // DB write may fail during shutdown
    }

    // Unregister from registry
    if (status === "failed") {
      registry.markFailed(processId)
    } else {
      registry.unregister(processId)
    }

    this.processes.delete(processId)
  }
}

export function getBackgroundProcessManager(): BackgroundProcessManager {
  const g = globalThis as Record<symbol, BackgroundProcessManager | undefined>
  if (!g[BG_MANAGER_KEY]) {
    g[BG_MANAGER_KEY] = new BackgroundProcessManager()
  }
  return g[BG_MANAGER_KEY]
}
