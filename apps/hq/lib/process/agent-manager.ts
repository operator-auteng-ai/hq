import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { eq } from "drizzle-orm"
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

    // Update DB
    try {
      const db = getDb()
      db.update(schema.agentRuns)
        .set({
          status,
          sessionId: sessionId ?? null,
          turnCount: turnCount ?? 0,
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.agentRuns.id, agentId))
        .run()
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
        const subs = this.subscribers.get(agentId) ?? []
        subs.push(sub)
        this.subscribers.set(agentId, subs)

        // If agent is already done, close immediately
        if (!this.agents.has(agentId)) {
          const encoder = new TextEncoder()
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", status: "not_running" })}\n\n`),
          )
          controller.close()
          sub.closed = true
        }
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

export function getAgentManager(): AgentManager {
  const g = globalThis as Record<symbol, AgentManager | undefined>
  if (!g[AGENT_MANAGER_KEY]) {
    g[AGENT_MANAGER_KEY] = new AgentManager()
  }
  return g[AGENT_MANAGER_KEY]
}
