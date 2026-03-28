import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { eq, and } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"
import { getProcessRegistry } from "./process-registry"
import { createHqMcpServer } from "./hq-mcp-server"
import { OutputAccumulator } from "./output-accumulator"
import type { AgentConfig, AgentInstance, AgentRunStatus } from "./types"

const AGENT_MANAGER_KEY = Symbol.for("auteng.agentManager")

interface StreamSubscriber {
  controller: ReadableStreamDefaultController<Uint8Array>
  closed: boolean
}

export class AgentManager {
  private agents = new Map<string, AgentInstance>()
  private accumulators = new Map<string, OutputAccumulator>()
  private subscribers = new Map<string, StreamSubscriber[]>()
  private completionCallbacks = new Map<string, Array<(agentId: string, status: AgentRunStatus) => void>>()

  onComplete(
    agentId: string,
    callback: (agentId: string, status: AgentRunStatus) => void,
  ): void {
    const callbacks = this.completionCallbacks.get(agentId) ?? []
    callbacks.push(callback)
    this.completionCallbacks.set(agentId, callbacks)
  }

  waitForAgent(agentId: string): Promise<AgentRunStatus> {
    if (!this.agents.has(agentId)) {
      const db = getDb()
      const run = db.select().from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, agentId)).get()
      if (run && run.status !== "queued" && run.status !== "running") {
        return Promise.resolve(run.status as AgentRunStatus)
      }
    }
    return new Promise((resolve) => {
      this.onComplete(agentId, (_id, status) => resolve(status))
    })
  }

  async spawn(
    agentId: string,
    projectId: string,
    prompt: string,
    config: AgentConfig = {},
  ): Promise<void> {
    const registry = getProcessRegistry()
    const db = getDb()

    // Get project workspace path
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()

    if (!project?.workspacePath) {
      this.updateRunStatus(agentId, "failed")
      throw new Error(`Project ${projectId} has no workspace path`)
    }

    const abortController = new AbortController()

    const agentInstance: AgentInstance = {
      id: agentId,
      projectId,
      type: "agent",
      status: "running",
      startedAt: new Date(),
      meta: { prompt, config },
      abortController,
      prompt,
      config,
    }

    // Register (checks concurrency limits)
    registry.register(agentInstance)
    this.agents.set(agentId, agentInstance)

    // Set up output accumulator
    const accumulator = new OutputAccumulator(agentId)
    this.accumulators.set(agentId, accumulator)

    // Update DB status to running
    this.updateRunStatus(agentId, "running")

    // Create MCP server for this project
    const hqMcp = createHqMcpServer(projectId)

    // Map model shortnames to full model IDs
    const modelMap: Record<string, string> = {
      sonnet: "claude-sonnet-4-6",
      opus: "claude-opus-4-6",
      haiku: "claude-haiku-4-5-20251001",
    }
    const model = modelMap[config.model ?? "sonnet"] ?? config.model ?? "claude-sonnet-4-6"

    // Ensure API key is available for the SDK
    if (config.apiKey) {
      process.env.ANTHROPIC_API_KEY = config.apiKey
    }

    // Spawn via SDK
    const agentQuery = query({
      prompt,
      options: {
        cwd: project.workspacePath,
        model,
        maxTurns: config.maxTurns ?? 50,
        maxBudgetUsd: config.maxBudgetUsd ?? 5.0,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        abortController,
        mcpServers: { hq: hqMcp },
      },
    })

    // Consume the async generator in the background
    this.consumeStream(agentId, agentQuery).catch((err) => {
      console.error(`Agent ${agentId} stream error:`, err)
      this.finishAgent(agentId, "failed", undefined, 0)
    })
  }

  private async consumeStream(
    agentId: string,
    agentQuery: AsyncGenerator<SDKMessage, void>,
  ): Promise<void> {
    const accumulator = this.accumulators.get(agentId)
    const encoder = new TextEncoder()
    let sessionId: string | undefined
    let turnCount = 0

    try {
      for await (const message of agentQuery) {
        // Capture session_id from messages
        if ("session_id" in message && message.session_id) {
          sessionId = message.session_id
        }

        // Count turns
        if (message.type === "assistant") {
          turnCount++
        }

        // Accumulate for DB
        accumulator?.push(message)

        // Forward to SSE subscribers
        this.broadcastToSubscribers(agentId, message, encoder)
      }

      // Completed successfully
      this.finishAgent(agentId, "completed", sessionId, turnCount)
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        this.finishAgent(agentId, "cancelled", sessionId, turnCount)
      } else {
        console.error(`Agent ${agentId} failed:`, err)
        this.finishAgent(agentId, "failed", sessionId, turnCount)
      }
    }
  }

  private broadcastToSubscribers(
    agentId: string,
    message: SDKMessage,
    encoder: TextEncoder,
  ): void {
    const subs = this.subscribers.get(agentId)
    if (!subs) return

    const data = `data: ${JSON.stringify(message)}\n\n`
    const encoded = encoder.encode(data)

    for (const sub of subs) {
      if (sub.closed) continue
      try {
        sub.controller.enqueue(encoded)
      } catch {
        sub.closed = true
      }
    }
  }

  private finishAgent(
    agentId: string,
    status: AgentRunStatus,
    sessionId?: string,
    turnCount?: number,
  ): void {
    // Flush accumulator
    const accumulator = this.accumulators.get(agentId)
    accumulator?.stop()
    this.accumulators.delete(agentId)

    // Update DB and persist completion system message
    try {
      const db = getDb()

      // Read run metadata before updating
      const run = db.select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, agentId))
        .get()

      db.update(schema.agentRuns)
        .set({
          status,
          sessionId: sessionId ?? null,
          turnCount: turnCount ?? 0,
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.agentRuns.id, agentId))
        .run()

      // Update the "running" system message to show completion status
      if (run?.projectId && run.phaseLabel) {
        const label = run.phaseLabel.charAt(0).toUpperCase() + run.phaseLabel.slice(1)
        const runningContent = `${label} agent running...`
        const iconMap: Record<string, string> = {
          completed: "completed",
          failed: "failed",
          cancelled: "failed",
        }
        const icon = iconMap[status] ?? "info"
        const suffix = status === "completed" ? "completed" : status

        // Try to update the existing "running" message first
        const updated = db.update(schema.chatMessages)
          .set({
            content: `${label} agent ${suffix}`,
            icon,
          })
          .where(
            and(
              eq(schema.chatMessages.projectId, run.projectId),
              eq(schema.chatMessages.content, runningContent),
              eq(schema.chatMessages.role, "system"),
            ),
          )
          .run()

        // If no running message was found, insert a new one
        if (updated.changes === 0) {
          db.insert(schema.chatMessages)
            .values({
              id: crypto.randomUUID(),
              projectId: run.projectId,
              role: "system",
              content: `${label} agent ${suffix}`,
              icon,
            })
            .run()
        }
      }
    } catch (err) {
      console.error(`Failed to update agent ${agentId} status:`, err)
    }

    // Close SSE subscribers
    const subs = this.subscribers.get(agentId)
    if (subs) {
      const encoder = new TextEncoder()
      for (const sub of subs) {
        if (!sub.closed) {
          try {
            sub.controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done", status })}\n\n`),
            )
            sub.controller.close()
          } catch {
            // already closed
          }
        }
      }
      this.subscribers.delete(agentId)
    }

    // Unregister from process registry
    const registry = getProcessRegistry()
    if (status === "failed") {
      registry.markFailed(agentId)
    } else {
      registry.unregister(agentId)
    }

    this.agents.delete(agentId)

    // Invoke completion callbacks
    const callbacks = this.completionCallbacks.get(agentId)
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(agentId, status)
        } catch (err) {
          console.error(`Agent ${agentId} completion callback error:`, err)
        }
      }
      this.completionCallbacks.delete(agentId)
    }
  }

  cancel(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false
    agent.abortController.abort()
    return true
  }

  async resume(agentId: string): Promise<string> {
    const db = getDb()
    const run = db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, agentId))
      .get()

    if (!run) throw new Error(`Agent run ${agentId} not found`)
    if (!run.sessionId) throw new Error(`Agent run ${agentId} has no session to resume`)

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, run.projectId))
      .get()

    if (!project?.workspacePath) {
      throw new Error(`Project ${run.projectId} has no workspace`)
    }

    // Create new agent run for the resumed session
    const { v4: uuidv4 } = await import("uuid")
    const newAgentId = uuidv4()

    db.insert(schema.agentRuns)
      .values({
        id: newAgentId,
        projectId: run.projectId,
        phaseLabel: run.phaseLabel,
        agentType: run.agentType,
        prompt: `Resume: ${run.prompt}`,
        status: "queued",
        model: run.model,
        maxTurns: run.maxTurns,
        budgetUsd: run.budgetUsd,
      })
      .run()

    const registry = getProcessRegistry()
    const abortController = new AbortController()

    const agentInstance: AgentInstance = {
      id: newAgentId,
      projectId: run.projectId,
      type: "agent",
      status: "running",
      startedAt: new Date(),
      meta: { resumed: true, originalId: agentId },
      sessionId: run.sessionId,
      abortController,
      prompt: run.prompt,
      config: {
        model: run.model ?? undefined,
        maxTurns: run.maxTurns ?? undefined,
        maxBudgetUsd: run.budgetUsd ?? undefined,
        phaseLabel: run.phaseLabel ?? undefined,
      },
    }

    registry.register(agentInstance)
    this.agents.set(newAgentId, agentInstance)

    const accumulator = new OutputAccumulator(newAgentId)
    this.accumulators.set(newAgentId, accumulator)

    this.updateRunStatus(newAgentId, "running")

    const hqMcp = createHqMcpServer(run.projectId)

    const modelMap: Record<string, string> = {
      sonnet: "claude-sonnet-4-6",
      opus: "claude-opus-4-6",
      haiku: "claude-haiku-4-5-20251001",
    }
    const model = modelMap[run.model ?? "sonnet"] ?? run.model ?? "claude-sonnet-4-6"

    // Set API key for resumed session
    const { getAnthropicApiKey } = await import("@/lib/services/secrets")
    const apiKey = getAnthropicApiKey()
    if (apiKey) {
      process.env.ANTHROPIC_API_KEY = apiKey
    }

    const agentQuery = query({
      prompt: "Continue where you left off.",
      options: {
        cwd: project.workspacePath,
        model,
        maxTurns: run.maxTurns ?? 50,
        maxBudgetUsd: run.budgetUsd ?? 5.0,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        abortController,
        resume: run.sessionId,
        mcpServers: { hq: hqMcp },
      },
    })

    this.consumeStream(newAgentId, agentQuery).catch((err) => {
      console.error(`Agent ${newAgentId} resume stream error:`, err)
    })

    return newAgentId
  }

  streamOutput(agentId: string): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        const sub: StreamSubscriber = { controller, closed: false }
        const encoder = new TextEncoder()

        // If agent is still running, subscribe for live updates
        if (this.agents.has(agentId)) {
          // Replay any messages already accumulated in the buffer
          const accumulator = this.accumulators.get(agentId)
          if (accumulator) {
            const buffered = accumulator.getBuffered()
            for (const msg of buffered) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`))
            }
          }

          const subs = this.subscribers.get(agentId) ?? []
          subs.push(sub)
          this.subscribers.set(agentId, subs)
          return
        }

        // Agent is done — replay stored messages from DB
        try {
          const db = getDb()
          const run = db
            .select({ output: schema.agentRuns.output, status: schema.agentRuns.status })
            .from(schema.agentRuns)
            .where(eq(schema.agentRuns.id, agentId))
            .get()

          if (run?.output) {
            const messages = JSON.parse(run.output) as unknown[]
            for (const msg of messages) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`))
            }
          }

          const finalStatus = run?.status ?? "not_running"
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", status: finalStatus })}\n\n`),
          )
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", status: "not_running" })}\n\n`),
          )
        }

        controller.close()
        sub.closed = true
      },
      cancel: () => {
        // Clean up subscriber on client disconnect
        const subs = this.subscribers.get(agentId)
        if (subs) {
          const remaining = subs.filter((s) => !s.closed)
          if (remaining.length === 0) {
            this.subscribers.delete(agentId)
          } else {
            this.subscribers.set(agentId, remaining)
          }
        }
      },
    })
  }

  getStatus(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId)
  }

  listByProject(projectId: string): AgentInstance[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.projectId === projectId,
    )
  }

  listAll(): AgentInstance[] {
    return Array.from(this.agents.values())
  }

  private updateRunStatus(agentId: string, status: AgentRunStatus): void {
    try {
      const db = getDb()
      db.update(schema.agentRuns)
        .set({ status })
        .where(eq(schema.agentRuns.id, agentId))
        .run()
    } catch (err) {
      console.error(`Failed to update agent ${agentId} status:`, err)
    }
  }
}

/**
 * Reconcile stale agent runs on startup.
 * Agents stuck in "running" or "queued" that aren't tracked in-memory
 * were interrupted by an app restart — mark them as "failed".
 */
function reconcileStaleRuns(manager: AgentManager): void {
  try {
    const db = getDb()
    const staleRuns = db
      .select({ id: schema.agentRuns.id })
      .from(schema.agentRuns)
      .where(
        and(
          eq(schema.agentRuns.status, "running"),
        ),
      )
      .all()

    const queuedRuns = db
      .select({ id: schema.agentRuns.id })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.status, "queued"))
      .all()

    const allStale = [...staleRuns, ...queuedRuns]
    let reconciled = 0

    for (const run of allStale) {
      // If the agent is tracked in-memory, it's genuinely running
      if (manager.getStatus(run.id) !== undefined) continue

      db.update(schema.agentRuns)
        .set({
          status: "failed",
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.agentRuns.id, run.id))
        .run()
      reconciled++
    }

    if (reconciled > 0) {
      console.log(`Reconciled ${reconciled} stale agent run(s) → failed`)
    }
  } catch (err) {
    console.error("Failed to reconcile stale agent runs:", err)
  }
}

export function getAgentManager(): AgentManager {
  const g = globalThis as Record<symbol, AgentManager | undefined>
  if (!g[AGENT_MANAGER_KEY]) {
    const manager = new AgentManager()
    g[AGENT_MANAGER_KEY] = manager
    reconcileStaleRuns(manager)
  }
  return g[AGENT_MANAGER_KEY]
}
