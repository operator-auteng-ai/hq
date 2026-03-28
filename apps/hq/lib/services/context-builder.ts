import { eq, desc, asc } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"
import { getDeliveryTracker } from "@/lib/services/delivery-tracker"

export interface ProjectContext {
  systemPrompt: string
  tokenEstimate: number
}

const STATUS_ICONS: Record<string, string> = {
  completed: "✓",
  in_progress: "●",
  active: "●",
  pending: "○",
  failed: "✗",
  skipped: "⊘",
  reviewing: "⟳",
  review_failed: "⚠",
}

function statusIcon(status: string): string {
  return STATUS_ICONS[status] ?? "?"
}

export function buildProjectContext(projectId: string): ProjectContext {
  const db = getDb()
  const tracker = getDeliveryTracker()

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .get()

  if (!project) throw new Error(`Project ${projectId} not found`)

  const parts: string[] = []

  // Header
  parts.push(`You are the orchestrator for project "${project.name}".`)

  // Vision
  if (project.visionHypothesis || project.successMetric) {
    parts.push("\n## Project Vision")
    if (project.visionHypothesis) {
      parts.push(`Hypothesis: ${project.visionHypothesis}`)
    }
    if (project.successMetric) {
      parts.push(`Success metric: ${project.successMetric}`)
    }
  }

  // Current status
  parts.push(`\n## Current Status`)
  parts.push(`Project status: ${project.status}`)

  // Milestone tree
  const tree = tracker.getProjectDeliveryTree(projectId)

  if (tree.milestones.length > 0) {
    parts.push("\n## Milestone Progress")

    for (const milestone of tree.milestones) {
      const mvpMarker = milestone.isMvpBoundary ? " ← MVP" : ""
      parts.push(
        `${statusIcon(milestone.status)} ${milestone.name} — ${milestone.status}${mvpMarker}`,
      )

      for (const phase of milestone.phases) {
        parts.push(`  Phase: ${phase.name} — ${phase.status}`)

        for (const task of phase.tasks) {
          const extra =
            task.status === "failed" ? " (failed)" : ""
          parts.push(
            `    ${statusIcon(task.status)} ${task.title} (${task.status})${extra}`,
          )
        }
      }
    }

    // Progress summary
    parts.push(
      `\nProgress: ${tree.progress.completedMilestones}/${tree.progress.totalMilestones} milestones, ${tree.progress.completedTasks}/${tree.progress.totalTasks} tasks`,
    )
  } else {
    parts.push("\nNo milestones defined yet.")
  }

  // Recent failures
  const failedRuns = db
    .select()
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.projectId, projectId))
    .orderBy(desc(schema.agentRuns.completedAt))
    .limit(20)
    .all()
    .filter((r) => r.status === "failed")
    .slice(0, 3)

  if (failedRuns.length > 0) {
    parts.push("\n## Recent Failures")

    for (const run of failedRuns) {
      const label = run.phaseLabel ?? run.taskId ?? "ad-hoc"
      parts.push(`Agent ${run.id.slice(0, 8)} (${label}):`)
      parts.push(`  Failed at ${run.completedAt ?? "unknown"}`)
      if (run.output) {
        const outputStr =
          typeof run.output === "string" ? run.output : JSON.stringify(run.output)
        const truncated =
          outputStr.length > 500
            ? outputStr.slice(-500)
            : outputStr
        parts.push(`  Last output: ${truncated}`)
      }
    }
  }

  // Available actions
  parts.push(`\n## Available Actions
You can propose these actions (user must confirm before execution):
- startTask <taskId> — start a pending task
- retryTask <taskId> — retry a failed task
- skipTask <taskId> — skip a pending or failed task
- approvePhase <phaseId> — approve a phase (from reviewing or review_failed)
- rejectPhase <phaseId> — reject a phase and reset tasks
- approveMilestone <milestoneId> — approve a completed milestone
- startPhase <phaseId> — start all pending tasks in a phase
- runSkill <skillName> [milestoneName] — re-run a planning skill

When proposing an action, output it on a line by itself in this format:
ACTION: <actionName> <entityId>

Only propose actions when the user requests them or when they're clearly implied.
Answer questions directly from the context above.
If you don't have enough information to answer, say so.`)

  const systemPrompt = parts.join("\n")
  const tokenEstimate = Math.ceil(systemPrompt.length / 4)

  return { systemPrompt, tokenEstimate }
}

export function loadChatHistory(
  projectId: string,
  limit: number = 20,
): Array<{ role: string; content: string }> {
  const db = getDb()
  const messages = db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.projectId, projectId))
    .orderBy(asc(schema.chatMessages.createdAt))
    .all()

  // Filter out system messages (Claude API expects user/assistant only)
  // then take last N messages
  const recent = messages.filter((m) => m.role !== "system").slice(-limit)

  return recent.map((m) => ({
    role: m.role,
    content: m.content,
  }))
}
