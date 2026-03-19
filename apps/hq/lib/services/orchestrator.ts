import { eq } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"
import { getAgentManager } from "@/lib/process/agent-manager"
import { getBackgroundProcessManager } from "@/lib/process/background-process-manager"
import { parsePhasesFromPlan, type ParsedPhase } from "@/lib/services/phase-parser"
import type { AgentConfig } from "@/lib/process/types"
import fs from "node:fs"
import path from "node:path"

export type PhaseAction = "approve" | "reject" | "skip"

export class Orchestrator {
  async startPhase(projectId: string, phaseNumber: number): Promise<string> {
    const db = getDb()
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()

    if (!project) throw new Error(`Project ${projectId} not found`)
    if (!project.workspacePath) throw new Error("Project has no workspace")

    const phase = this.getPhase(project.workspacePath, phaseNumber)
    if (!phase) throw new Error(`Phase ${phaseNumber} not found in PLAN.md`)

    // Log phase start to PLAN_PROGRESS_LOG.md
    this.appendProgressLog(project.workspacePath, `Phase ${phaseNumber} started — "${phase.name}"`)

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
        phaseLabel: `Phase ${phaseNumber}`,
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
    phaseNumber: number,
    action: PhaseAction,
  ): Promise<{ nextPhaseNumber?: number }> {
    const db = getDb()
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()

    if (!project?.workspacePath) return {}

    const phases = this.getPhases(project.workspacePath)
    const current = phases.find((p) => p.phaseNumber === phaseNumber)
    if (!current) return {}

    switch (action) {
      case "approve": {
        this.appendProgressLog(project.workspacePath, `Phase ${phaseNumber} completed — "${current.name}" approved`)
        const next = phases.find((p) => p.phaseNumber === phaseNumber + 1)
        return { nextPhaseNumber: next?.phaseNumber }
      }

      case "reject": {
        this.appendProgressLog(project.workspacePath, `Phase ${phaseNumber} rejected — "${current.name}" needs rework`)
        return {}
      }

      case "skip": {
        this.appendProgressLog(project.workspacePath, `Phase ${phaseNumber} skipped — "${current.name}"`)
        const next = phases.find((p) => p.phaseNumber === phaseNumber + 1)
        return { nextPhaseNumber: next?.phaseNumber }
      }
    }
  }

  async markPhaseForReview(projectId: string, phaseNumber: number): Promise<void> {
    const db = getDb()
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()

    if (!project?.workspacePath) return

    this.appendProgressLog(project.workspacePath, `Phase ${phaseNumber} pending review — approval gate`)
  }

  async stopPhase(projectId: string, phaseNumber: number): Promise<void> {
    const agentManager = getAgentManager()
    const bgManager = getBackgroundProcessManager()

    // Cancel all agents for this project with matching phase label
    const phaseLabel = `Phase ${phaseNumber}`
    const agents = agentManager.listByProject(projectId)
    for (const agent of agents) {
      if (agent.config.phaseLabel === phaseLabel) {
        agentManager.cancel(agent.id)
      }
    }

    // Stop background processes
    await bgManager.stopAllForProject(projectId)
  }

  private getPhases(workspacePath: string): ParsedPhase[] {
    const planPath = path.join(workspacePath, "docs", "PLAN.md")
    if (!fs.existsSync(planPath)) return []
    const content = fs.readFileSync(planPath, "utf-8")
    return parsePhasesFromPlan(content)
  }

  private getPhase(workspacePath: string, phaseNumber: number): ParsedPhase | undefined {
    return this.getPhases(workspacePath).find((p) => p.phaseNumber === phaseNumber)
  }

  private appendProgressLog(workspacePath: string, entry: string): void {
    const logPath = path.join(workspacePath, "docs", "PLAN_PROGRESS_LOG.md")
    const timestamp = new Date().toISOString()
    const line = `\n- [${timestamp}] ${entry}\n`

    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, `# PLAN_PROGRESS_LOG\n${line}`)
    } else {
      fs.appendFileSync(logPath, line)
    }
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
