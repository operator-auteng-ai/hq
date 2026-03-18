import { eq } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"
import { getAgentManager } from "@/lib/process/agent-manager"
import { getBackgroundProcessManager } from "@/lib/process/background-process-manager"
import type { AgentConfig } from "@/lib/process/types"

export type PhaseAction = "approve" | "reject" | "skip"

export class Orchestrator {
  async startPhase(projectId: string, phaseId: string): Promise<string> {
    const db = getDb()
    const phase = db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, phaseId))
      .get()

    if (!phase) throw new Error(`Phase ${phaseId} not found`)
    if (phase.projectId !== projectId) {
      throw new Error(`Phase ${phaseId} does not belong to project ${projectId}`)
    }

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()

    if (!project) throw new Error(`Project ${projectId} not found`)

    // Update phase status to active
    db.update(schema.phases)
      .set({ status: "active", startedAt: new Date().toISOString() })
      .where(eq(schema.phases.id, phaseId))
      .run()

    // Update project status to building
    if (project.status !== "building") {
      db.update(schema.projects)
        .set({ status: "building", updatedAt: new Date().toISOString() })
        .where(eq(schema.projects.id, projectId))
        .run()
    }

    // Build the agent prompt from phase info
    const prompt = this.buildPhasePrompt(phase, project)

    // Get config from process_configs or use defaults
    const config = await this.getProjectConfig(projectId)

    // Spawn agent
    const agentManager = getAgentManager()
    const { v4: uuidv4 } = await import("uuid")
    const agentId = uuidv4()

    db.insert(schema.agentRuns)
      .values({
        id: agentId,
        projectId,
        phaseId,
        agentType: "claude_code",
        prompt,
        status: "queued",
        model: config.model ?? "sonnet",
        maxTurns: config.maxTurns ?? 50,
        budgetUsd: config.maxBudgetUsd ?? 5.0,
      })
      .run()

    await agentManager.spawn(agentId, projectId, prompt, config)

    return agentId
  }

  async handlePhaseAction(
    projectId: string,
    phaseId: string,
    action: PhaseAction,
  ): Promise<{ nextPhaseId?: string }> {
    const db = getDb()

    switch (action) {
      case "approve": {
        db.update(schema.phases)
          .set({ status: "completed", completedAt: new Date().toISOString() })
          .where(eq(schema.phases.id, phaseId))
          .run()

        // Find next phase
        const currentPhase = db
          .select()
          .from(schema.phases)
          .where(eq(schema.phases.id, phaseId))
          .get()

        if (!currentPhase) return {}

        const nextPhase = db
          .select()
          .from(schema.phases)
          .where(eq(schema.phases.projectId, projectId))
          .all()
          .find((p) => p.phaseNumber === currentPhase.phaseNumber + 1)

        return { nextPhaseId: nextPhase?.id }
      }

      case "reject": {
        // Reset to active — user wants re-run
        db.update(schema.phases)
          .set({ status: "active" })
          .where(eq(schema.phases.id, phaseId))
          .run()
        return {}
      }

      case "skip": {
        db.update(schema.phases)
          .set({ status: "completed", completedAt: new Date().toISOString() })
          .where(eq(schema.phases.id, phaseId))
          .run()

        const currentPhase = db
          .select()
          .from(schema.phases)
          .where(eq(schema.phases.id, phaseId))
          .get()

        if (!currentPhase) return {}

        const nextPhase = db
          .select()
          .from(schema.phases)
          .where(eq(schema.phases.projectId, projectId))
          .all()
          .find((p) => p.phaseNumber === currentPhase.phaseNumber + 1)

        return { nextPhaseId: nextPhase?.id }
      }
    }
  }

  async markPhaseForReview(phaseId: string): Promise<void> {
    const db = getDb()
    db.update(schema.phases)
      .set({ status: "review" })
      .where(eq(schema.phases.id, phaseId))
      .run()
  }

  async stopPhase(projectId: string, phaseId: string): Promise<void> {
    const agentManager = getAgentManager()
    const bgManager = getBackgroundProcessManager()

    // Cancel all agents for this project
    const agents = agentManager.listByProject(projectId)
    for (const agent of agents) {
      if (agent.config.phaseId === phaseId) {
        agentManager.cancel(agent.id)
      }
    }

    // Stop background processes
    await bgManager.stopAllForProject(projectId)
  }

  private buildPhasePrompt(
    phase: { name: string; phaseNumber: number; exitCriteria: string | null },
    project: { name: string; prompt: string },
  ): string {
    return [
      `You are working on project "${project.name}".`,
      `Original project prompt: ${project.prompt}`,
      "",
      `Your task is to implement Phase ${phase.phaseNumber}: ${phase.name}`,
      "",
      phase.exitCriteria
        ? `Exit criteria:\n${phase.exitCriteria}`
        : "",
      "",
      "Read the project's docs/ directory first (WORKFLOW.md → CODING-STANDARDS.md → ARCH.md → PLAN.md) to understand the full context.",
      "Implement the tasks described in PLAN.md for this phase.",
      "Log your progress to docs/PLAN_PROGRESS_LOG.md as you complete tasks.",
    ]
      .filter(Boolean)
      .join("\n")
  }

  private async getProjectConfig(projectId: string): Promise<AgentConfig> {
    const db = getDb()
    const config = db
      .select()
      .from(schema.processConfigs)
      .where(eq(schema.processConfigs.projectId, projectId))
      .get()

    if (config) {
      return {
        model: config.defaultModel ?? "sonnet",
        maxTurns: config.defaultMaxTurns ?? 50,
        maxBudgetUsd: config.defaultBudgetUsd ?? 5.0,
      }
    }

    // Check for global config (null projectId)
    const globalConfig = db
      .select()
      .from(schema.processConfigs)
      .all()
      .find((c) => c.projectId === null)

    if (globalConfig) {
      return {
        model: globalConfig.defaultModel ?? "sonnet",
        maxTurns: globalConfig.defaultMaxTurns ?? 50,
        maxBudgetUsd: globalConfig.defaultBudgetUsd ?? 5.0,
      }
    }

    return { model: "sonnet", maxTurns: 50, maxBudgetUsd: 5.0 }
  }
}

const ORCHESTRATOR_KEY = Symbol.for("auteng.orchestrator")

export function getOrchestrator(): Orchestrator {
  const g = globalThis as Record<symbol, Orchestrator | undefined>
  if (!g[ORCHESTRATOR_KEY]) {
    g[ORCHESTRATOR_KEY] = new Orchestrator()
  }
  return g[ORCHESTRATOR_KEY]
}
