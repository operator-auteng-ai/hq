import { eq } from "drizzle-orm"
import fs from "node:fs"
import path from "node:path"
import { getDb, schema } from "@/lib/db"
import { getAgentManager } from "@/lib/process/agent-manager"
import {
  getDeliveryTracker,
  type TaskRecord,
  type PhaseRecord,
  type MilestoneRecord,
  type PhaseReviewResult,
} from "@/lib/services/delivery-tracker"
import { getPlanningEngine, milestoneToArchDir } from "@/lib/services/planning-engine"
import { getAnthropicApiKey } from "@/lib/services/secrets"
import type { AgentConfig, AgentRunStatus } from "@/lib/process/types"

export class Orchestrator {
  // ── Task execution ──

  async startTask(taskId: string): Promise<{ agentId: string }> {
    const db = getDb()
    const tracker = getDeliveryTracker()
    const agentManager = getAgentManager()

    // Load task → phase → milestone → project
    const task = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .get()
    if (!task) throw new Error(`Task ${taskId} not found`)

    const phase = db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, task.phaseId))
      .get()
    if (!phase) throw new Error(`Phase ${task.phaseId} not found`)

    const milestone = db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.id, phase.milestoneId))
      .get()
    if (!milestone) throw new Error(`Milestone ${phase.milestoneId} not found`)

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, milestone.projectId))
      .get()
    if (!project) throw new Error(`Project ${milestone.projectId} not found`)

    // Update statuses
    tracker.updateTaskStatus(taskId, "in_progress")

    if (phase.status === "pending") {
      tracker.updatePhaseStatus(phase.id, "active")
    }
    if (milestone.status === "pending") {
      tracker.updateMilestoneStatus(milestone.id, "active")
    }
    if (project.status !== "building") {
      db.update(schema.projects)
        .set({ status: "building", updatedAt: new Date().toISOString() })
        .where(eq(schema.projects.id, project.id))
        .run()
    }

    // Build prompt and config
    const prompt = this.buildTaskPrompt(task, phase, milestone, project)
    const config = await this.getProjectConfig(project.id)
    const apiKey = getAnthropicApiKey()
    if (!apiKey) throw new Error("No API key configured")

    // Insert agent_runs record
    const agentId = crypto.randomUUID()
    db.insert(schema.agentRuns)
      .values({
        id: agentId,
        projectId: project.id,
        taskId,
        agentType: "claude_code",
        prompt,
        status: "queued",
        model: config.model,
        maxTurns: config.maxTurns ?? 50,
        budgetUsd: config.maxBudgetUsd ?? 5.0,
      })
      .run()

    // Spawn agent
    await agentManager.spawn(agentId, project.id, prompt, {
      ...config,
      taskId,
      apiKey,
    })

    // Register completion callback
    agentManager.onComplete(agentId, (id, status) => {
      this.onAgentCompleted(id, status).catch((err) => {
        console.error(
          `Orchestrator completion handler error for agent ${id}:`,
          err,
        )
      })
    })

    return { agentId }
  }

  async onAgentCompleted(
    agentId: string,
    status: AgentRunStatus,
  ): Promise<void> {
    const db = getDb()
    const tracker = getDeliveryTracker()

    // Load agent run to get task_id
    const run = db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, agentId))
      .get()
    if (!run?.taskId) return // Ad-hoc or planning agent

    const taskId = run.taskId

    // Update task status based on agent result
    if (status === "completed") {
      tracker.updateTaskStatus(taskId, "completed")
    } else if (status === "failed") {
      tracker.updateTaskStatus(taskId, "failed")
    }
    // cancelled → leave task as in_progress for manual retry

    // Load task to get phase
    const task = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .get()
    if (!task) return

    // Check if phase should transition to reviewing
    const phaseTransitioned = tracker.checkPhaseCompletion(task.phaseId)
    if (phaseTransitioned) {
      await this.triggerPhaseReview(task.phaseId)
      return
    }

    // If phase still active, auto-advance to next pending task
    if (status === "completed") {
      const nextTask = tracker.getNextPendingTask(task.phaseId)
      if (nextTask) {
        await this.startTask(nextTask.id).catch((err) => {
          console.error(
            `Auto-advance failed for task ${nextTask.id}:`,
            err,
          )
        })
      }
    }
  }

  // ── Phase management ──

  async startPhase(phaseId: string): Promise<{ agentId: string }> {
    const db = getDb()
    const tracker = getDeliveryTracker()

    const firstTask = tracker.getNextPendingTask(phaseId)
    if (!firstTask) throw new Error("No pending tasks in this phase")

    // Activate phase if pending
    const phase = db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, phaseId))
      .get()
    if (phase && phase.status === "pending") {
      tracker.updatePhaseStatus(phaseId, "active")
      const milestone = db
        .select()
        .from(schema.milestones)
        .where(eq(schema.milestones.id, phase.milestoneId))
        .get()
      if (milestone && milestone.status === "pending") {
        tracker.updateMilestoneStatus(milestone.id, "active")
      }
    }

    return this.startTask(firstTask.id)
  }

  async approvePhase(
    phaseId: string,
  ): Promise<{ nextPhaseId?: string }> {
    const db = getDb()
    const tracker = getDeliveryTracker()

    const phase = db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, phaseId))
      .get()
    if (!phase) throw new Error(`Phase ${phaseId} not found`)

    if (
      phase.status === "reviewing" ||
      phase.status === "review_failed"
    ) {
      // Force-approve: review_failed → completed is in the transition map
      tracker.updatePhaseStatus(phaseId, "completed")
    } else if (phase.status !== "completed") {
      throw new Error(`Cannot approve phase in status: ${phase.status}`)
    }

    // Find next phase
    const allPhases = tracker.getPhases(phase.milestoneId)
    const currentIdx = allPhases.findIndex((p) => p.id === phaseId)
    const nextPhase = allPhases[currentIdx + 1]

    return { nextPhaseId: nextPhase?.id }
  }

  async rejectPhase(phaseId: string): Promise<void> {
    const tracker = getDeliveryTracker()
    tracker.resetPhaseForRework(phaseId)
  }

  async skipPhase(
    phaseId: string,
  ): Promise<{ nextPhaseId?: string }> {
    const db = getDb()
    const tracker = getDeliveryTracker()

    // Skip all pending/failed tasks
    const tasks = tracker.getTasks(phaseId)
    for (const task of tasks) {
      if (task.status === "pending" || task.status === "failed") {
        // Can't skip failed directly — reset to pending first
        if (task.status === "failed") {
          db.update(schema.tasks)
            .set({ status: "pending", completedAt: null })
            .where(eq(schema.tasks.id, task.id))
            .run()
        }
        tracker.updateTaskStatus(task.id, "skipped")
      }
    }

    // Phase should cascade to reviewing, then force-approve
    const phase = db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, phaseId))
      .get()

    if (phase && phase.status !== "completed") {
      // Force to completed
      db.update(schema.phases)
        .set({
          status: "completed",
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.phases.id, phaseId))
        .run()

      if (phase.milestoneId) {
        tracker.checkMilestoneCompletion(phase.milestoneId)
      }
    }

    // Find next phase
    if (!phase) return {}
    const allPhases = tracker.getPhases(phase.milestoneId)
    const currentIdx = allPhases.findIndex((p) => p.id === phaseId)
    const nextPhase = allPhases[currentIdx + 1]

    return { nextPhaseId: nextPhase?.id }
  }

  // ── Milestone management ──

  async approveMilestone(
    milestoneId: string,
  ): Promise<{ nextMilestoneId?: string }> {
    const db = getDb()
    const tracker = getDeliveryTracker()

    const milestone = db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.id, milestoneId))
      .get()
    if (!milestone) throw new Error(`Milestone ${milestoneId} not found`)

    if (milestone.status === "active") {
      tracker.updateMilestoneStatus(milestoneId, "completed")
    }

    await this.triggerArchRollup(milestoneId)

    // Find next milestone
    const allMilestones = tracker.getMilestones(milestone.projectId)
    const currentIdx = allMilestones.findIndex(
      (m) => m.id === milestoneId,
    )
    const nextMilestone = allMilestones[currentIdx + 1]

    return { nextMilestoneId: nextMilestone?.id }
  }

  // ── Internal ──

  private buildTaskPrompt(
    task: TaskRecord,
    phase: PhaseRecord,
    milestone: MilestoneRecord,
    project: { name: string; prompt: string },
  ): string {
    const parts = [
      `You are working on project "${project.name}".`,
      `Original project prompt: ${project.prompt}`,
      "",
      `Milestone: ${milestone.name}`,
      milestone.description ? `  ${milestone.description}` : "",
      `Phase: ${phase.name}`,
      phase.description ? `  ${phase.description}` : "",
      "",
      `Task: ${task.title}`,
      task.description ?? "",
    ]

    if (task.sourceDoc) {
      parts.push("", `Read ${task.sourceDoc} for the detailed design.`)
    }

    parts.push(
      "",
      "Read the project's docs/ directory for full context if needed.",
      "Implement this task. When done, commit your changes.",
    )

    return parts.filter(Boolean).join("\n")
  }

  private async triggerPhaseReview(phaseId: string): Promise<void> {
    const db = getDb()
    const agentManager = getAgentManager()

    const phase = db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, phaseId))
      .get()
    if (!phase) return

    const milestone = db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.id, phase.milestoneId))
      .get()
    if (!milestone) return

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, milestone.projectId))
      .get()
    if (!project?.workspacePath) return

    const exitCriteria = phase.exitCriteria
      ? (JSON.parse(phase.exitCriteria) as string[])
      : ["Tests pass", "No lint errors", "Code compiles"]

    const prompt = [
      `You are reviewing phase "${phase.name}" of milestone "${milestone.name}" in project "${project.name}".`,
      "",
      "Check each of the following exit criteria and report pass/fail with evidence:",
      ...exitCriteria.map((c, i) => `${i + 1}. ${c}`),
      "",
      "Run the project's test suite if a test command exists (check package.json scripts).",
      "Review the code changes for quality and consistency.",
      "",
      "Output your review as JSON in a code fence:",
      "```json",
      '{ "criteria": [{ "criterion": "...", "passed": true/false, "evidence": "...", "suggestedFix": "..." }], "testsRan": true/false, "testsPassed": 0, "testsFailed": 0, "overallPass": true/false }',
      "```",
    ].join("\n")

    const config = await this.getProjectConfig(milestone.projectId)
    const apiKey = getAnthropicApiKey()
    if (!apiKey) return

    const agentId = crypto.randomUUID()
    db.insert(schema.agentRuns)
      .values({
        id: agentId,
        projectId: milestone.projectId,
        agentType: "claude_code",
        prompt,
        status: "queued",
        model: config.model,
        phaseLabel: `review:${phase.name}`,
      })
      .run()

    await agentManager.spawn(agentId, milestone.projectId, prompt, {
      ...config,
      apiKey,
    })

    agentManager.onComplete(agentId, (_id, status) => {
      if (status !== "completed") return

      const run = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, agentId))
        .get()
      if (!run?.output) return

      const tracker = getDeliveryTracker()
      try {
        const outputStr =
          typeof run.output === "string"
            ? run.output
            : JSON.stringify(run.output)
        const jsonMatch = outputStr.match(/```json\s*([\s\S]*?)\s*```/)
        if (!jsonMatch) return

        const result = JSON.parse(jsonMatch[1]) as PhaseReviewResult
        result.timestamp = new Date().toISOString()
        tracker.setPhaseReviewResult(phaseId, result)

        if (result.overallPass) {
          tracker.updatePhaseStatus(phaseId, "completed")
          const milestoneCompleted = tracker.checkMilestoneCompletion(
            phase.milestoneId,
          )

          // Auto-start next phase or handle milestone completion
          if (!milestoneCompleted) {
            // Find and auto-start next phase
            const allPhases = tracker.getPhases(phase.milestoneId)
            const currentIdx = allPhases.findIndex(
              (p) => p.id === phaseId,
            )
            const nextPhase = allPhases[currentIdx + 1]
            if (nextPhase && nextPhase.status === "pending") {
              const nextTask = tracker.getNextPendingTask(nextPhase.id)
              if (nextTask) {
                this.startPhase(nextPhase.id).catch((err) => {
                  console.error(
                    `Auto-start next phase failed:`,
                    err,
                  )
                })
              }
            }
          } else if (this.isFullAuto(milestone.projectId)) {
            // Full auto: auto-approve milestone and start next
            this.approveMilestone(milestone.id).catch((err) => {
              console.error(`Auto-approve milestone failed:`, err)
            })
          }
        } else {
          tracker.updatePhaseStatus(phaseId, "review_failed")
          const failedCriteria = result.criteria
            .filter((c) => !c.passed)
            .map((c) => ({
              criterion: c.criterion,
              suggestedFix: c.suggestedFix,
            }))
          if (failedCriteria.length > 0) {
            tracker.createFixUpTasks(phaseId, failedCriteria)
            // Auto-start fix-up tasks
            tracker.updatePhaseStatus(phaseId, "active")
            const nextFixUp = tracker.getNextPendingTask(phaseId)
            if (nextFixUp) {
              this.startTask(nextFixUp.id).catch((err) => {
                console.error(`Auto-start fix-up task failed:`, err)
              })
            }
          }
        }
      } catch {
        // Failed to parse review — leave in reviewing for user
      }
    })
  }

  private async triggerArchRollup(milestoneId: string): Promise<void> {
    const db = getDb()

    const milestone = db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.id, milestoneId))
      .get()
    if (!milestone) return

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, milestone.projectId))
      .get()
    if (!project?.workspacePath) return

    const archDir = milestoneToArchDir(milestone.name)
    const deltaPath = path.join(
      project.workspacePath,
      "docs",
      "milestones",
      archDir,
      "ARCH.md",
    )

    if (!fs.existsSync(deltaPath)) return

    const engine = getPlanningEngine()
    const config = await this.getProjectConfig(milestone.projectId)
    const apiKey = getAnthropicApiKey()
    if (!apiKey) return

    await engine.runSkill(
      milestone.projectId,
      "architecture",
      { model: config.model ?? "sonnet", apiKey },
      { milestoneName: `rollup:${milestone.name}` },
    )
  }

  private isFullAuto(projectId: string): boolean {
    const db = getDb()
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()
    return project?.collaborationProfile === "full_auto"
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
