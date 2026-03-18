import { EventEmitter } from "node:events"
import type {
  ManagedProcess,
  ConcurrencyLimits,
} from "./types"
import { ConcurrencyLimitError, DEFAULT_CONCURRENCY_LIMITS } from "./types"

const REGISTRY_KEY = Symbol.for("auteng.processRegistry")

export class ProcessRegistry extends EventEmitter {
  private processes = new Map<string, ManagedProcess>()
  private limits: ConcurrencyLimits

  constructor(limits?: Partial<ConcurrencyLimits>) {
    super()
    this.limits = { ...DEFAULT_CONCURRENCY_LIMITS, ...limits }
  }

  register(process: ManagedProcess): void {
    if (this.processes.size >= this.limits.globalMax) {
      throw new ConcurrencyLimitError(
        `Global process limit reached (${this.limits.globalMax})`,
      )
    }

    const projectProcesses = this.getByProject(process.projectId)
    const typeCount = projectProcesses.filter((p) => p.type === process.type).length

    if (process.type === "agent" && typeCount >= this.limits.maxAgentsPerProject) {
      throw new ConcurrencyLimitError(
        `Agent limit reached for project ${process.projectId} (${this.limits.maxAgentsPerProject})`,
      )
    }

    if (process.type === "background" && typeCount >= this.limits.maxBackgroundPerProject) {
      throw new ConcurrencyLimitError(
        `Background process limit reached for project ${process.projectId} (${this.limits.maxBackgroundPerProject})`,
      )
    }

    this.processes.set(process.id, process)
    this.emit("process:started", process)
  }

  unregister(id: string): void {
    const process = this.processes.get(id)
    if (process) {
      this.processes.delete(id)
      this.emit("process:stopped", process)
    }
  }

  markFailed(id: string): void {
    const process = this.processes.get(id)
    if (process) {
      process.status = "failed"
      this.processes.delete(id)
      this.emit("process:failed", process)
    }
  }

  get(id: string): ManagedProcess | undefined {
    return this.processes.get(id)
  }

  getByProject(projectId: string): ManagedProcess[] {
    return Array.from(this.processes.values()).filter(
      (p) => p.projectId === projectId,
    )
  }

  getByType(type: "agent" | "background"): ManagedProcess[] {
    return Array.from(this.processes.values()).filter((p) => p.type === type)
  }

  getAll(): ManagedProcess[] {
    return Array.from(this.processes.values())
  }

  count(): number {
    return this.processes.size
  }

  countByProject(projectId: string): number {
    return this.getByProject(projectId).length
  }

  async shutdownAll(): Promise<void> {
    const all = this.getAll()
    this.processes.clear()
    for (const process of all) {
      this.emit("process:stopped", process)
    }
  }
}

export function getProcessRegistry(): ProcessRegistry {
  const g = globalThis as Record<symbol, ProcessRegistry | undefined>
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new ProcessRegistry()
  }
  return g[REGISTRY_KEY]
}
