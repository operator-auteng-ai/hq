import type { ChildProcess } from "node:child_process"
import type { RingBuffer } from "./ring-buffer"

// ── Process Types ────────────────────────────────────────────────────────

export type ProcessType = "agent" | "background"

export type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export type BackgroundProcessType =
  | "dev_server"
  | "test_watcher"
  | "build_watcher"
  | "custom"

export type BackgroundProcessStatus =
  | "starting"
  | "running"
  | "stopped"
  | "failed"

// ── Managed Process (registry entry) ─────────────────────────────────────

export interface ManagedProcess {
  id: string
  projectId: string
  type: ProcessType
  status: "running" | "stopped" | "failed"
  startedAt: Date
  meta: Record<string, unknown>
}

// ── Agent Instance ───────────────────────────────────────────────────────

export interface AgentConfig {
  model?: string
  maxTurns?: number
  maxBudgetUsd?: number
  taskId?: string
  phaseLabel?: string
  apiKey?: string
}

export interface AgentInstance extends ManagedProcess {
  type: "agent"
  sessionId?: string
  abortController: AbortController
  prompt: string
  config: AgentConfig
}

// ── Background Process ───────────────────────────────────────────────────

export interface BackgroundProcess extends ManagedProcess {
  type: "background"
  processType: BackgroundProcessType
  command: string
  args: string[]
  cwd: string
  childProcess: ChildProcess
  ringBuffer: RingBuffer
  port?: number
  url?: string
}

// ── Concurrency Limits ───────────────────────────────────────────────────

export interface ConcurrencyLimits {
  globalMax: number
  maxAgentsPerProject: number
  maxBackgroundPerProject: number
}

export const DEFAULT_CONCURRENCY_LIMITS: ConcurrencyLimits = {
  globalMax: 15,
  maxAgentsPerProject: 5,
  maxBackgroundPerProject: 3,
}

// ── Ring Buffer Entry ────────────────────────────────────────────────────

export interface RingBufferEntry {
  timestamp: Date
  stream: "stdout" | "stderr"
  line: string
}

// ── Errors ───────────────────────────────────────────────────────────────

export class ConcurrencyLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConcurrencyLimitError"
  }
}
