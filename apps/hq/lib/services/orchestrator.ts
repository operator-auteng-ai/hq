import { eq } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"
import type { AgentConfig } from "@/lib/process/types"

export type PhaseAction = "approve" | "reject" | "skip"

const PHASE_MGMT_ERROR = "Use delivery tracker and milestones API for phase management"

export class Orchestrator {
  async startPhase(_projectId: string, _phaseNumber: number): Promise<string> {
    throw new Error(PHASE_MGMT_ERROR)
  }

  async handlePhaseAction(
    _projectId: string,
    _phaseNumber: number,
    _action: PhaseAction,
  ): Promise<{ nextPhaseNumber?: number }> {
    throw new Error(PHASE_MGMT_ERROR)
  }

  async markPhaseForReview(_projectId: string, _phaseNumber: number): Promise<void> {
    throw new Error(PHASE_MGMT_ERROR)
  }

  async stopPhase(_projectId: string, _phaseNumber: number): Promise<void> {
    throw new Error(PHASE_MGMT_ERROR)
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
