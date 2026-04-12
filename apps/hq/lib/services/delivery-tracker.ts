import { eq, and, asc, sql } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"

// ── Status types ────────────────────────────────────────────────────────

export type MilestoneStatus = "pending" | "active" | "completed" | "failed"
export type PhaseStatus =
  | "pending"
  | "active"
  | "reviewing"
  | "review_failed"
  | "completed"
  | "failed"
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped"
export type ReleaseStatus = "pending" | "published" | "failed"

// ── Record types ────────────────────────────────────────────────────────

export type MilestoneRecord = typeof schema.milestones.$inferSelect
export type PhaseRecord = typeof schema.phases.$inferSelect
export type TaskRecord = typeof schema.tasks.$inferSelect
export type ReleaseRecord = typeof schema.releases.$inferSelect

export interface PhaseReviewCriterion {
  criterion: string
  passed: boolean
  evidence: string
  suggestedFix?: string
}

export interface PhaseReviewResult {
  timestamp: string
  criteria: PhaseReviewCriterion[]
  testsRan: boolean
  testsPassed: number
  testsFailed: number
  overallPass: boolean
}

export interface FailedCriterion {
  criterion: string
  suggestedFix?: string
}

export interface MilestoneWithChildren extends MilestoneRecord {
  phases: PhaseWithTasks[]
}

export interface PhaseWithTasks extends PhaseRecord {
  tasks: TaskRecord[]
}

export interface ProjectDeliveryTree {
  milestones: MilestoneWithChildren[]
  progress: ProjectProgress
}

export interface ProjectProgress {
  totalMilestones: number
  completedMilestones: number
  totalTasks: number
  completedTasks: number
  currentMilestone: MilestoneRecord | null
  currentPhase: PhaseRecord | null
}

// ── Valid transitions ───────────────────────────────────────────────────

const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  pending: ["active"],
  active: ["completed", "failed"],
  completed: [],
  failed: ["active"],
}

const PHASE_TRANSITIONS: Record<PhaseStatus, PhaseStatus[]> = {
  pending: ["active"],
  active: ["reviewing", "failed"],
  reviewing: ["review_failed", "completed"],
  review_failed: ["active", "completed"],
  completed: [],
  failed: ["active"],
}

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_progress", "skipped"],
  in_progress: ["completed", "failed"],
  completed: [],
  failed: ["in_progress"],
  skipped: [],
}

// ── Delivery Tracker ────────────────────────────────────────────────────
//
// Transaction strategy: This class performs multiple sequential DB writes
// without explicit transactions. This is acceptable because:
// 1. better-sqlite3 is synchronous — each .run() auto-commits before the next
// 2. Single Node.js process — no concurrent write contention
// 3. Failure recovery is straightforward — re-run the operation
// If the app moves to async DB or multi-process writes, add transactions.

export class DeliveryTracker {
  // ── Milestone operations ──

  createMilestones(
    projectId: string,
    items: Array<{
      name: string
      description?: string
      isMvpBoundary?: boolean
    }>,
  ): MilestoneRecord[] {
    const db = getDb()
    const results: MilestoneRecord[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const id = crypto.randomUUID()
      db.insert(schema.milestones)
        .values({
          id,
          projectId,
          name: item.name,
          description: item.description ?? null,
          sortOrder: i,
          isMvpBoundary: item.isMvpBoundary ? 1 : 0,
          status: "pending",
        })
        .run()

      const record = db
        .select()
        .from(schema.milestones)
        .where(eq(schema.milestones.id, id))
        .get()!
      results.push(record)
    }

    return results
  }

  /**
   * Replace the project's milestone set with the given list, keyed by name.
   *
   * Semantics:
   * - If a milestone with a given name already exists, update its description,
   *   isMvpBoundary, and sortOrder. Preserve its id, status, and completedAt.
   * - If a milestone name is new, insert it with status "pending".
   * - If an existing milestone's name is not in the new list, delete it
   *   (and cascade to its phases/tasks per the schema foreign keys).
   *
   * This is the canonical write path for milestones. The milestones skill
   * calls it via the hq MCP server so agents never need to serialize their
   * own database back out of a markdown file.
   */
  setMilestones(
    projectId: string,
    items: Array<{
      name: string
      description?: string
      isMvpBoundary?: boolean
    }>,
  ): MilestoneRecord[] {
    const db = getDb()

    // Load existing milestones for this project, keyed by name
    const existing = db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.projectId, projectId))
      .all()
    const existingByName = new Map(existing.map((m) => [m.name, m]))
    const incomingNames = new Set(items.map((item) => item.name))

    // Delete milestones whose names are not in the new list
    for (const m of existing) {
      if (!incomingNames.has(m.name)) {
        db.delete(schema.milestones)
          .where(eq(schema.milestones.id, m.id))
          .run()
      }
    }

    // Upsert each incoming milestone by name
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const prior = existingByName.get(item.name)
      if (prior) {
        db.update(schema.milestones)
          .set({
            description: item.description ?? null,
            sortOrder: i,
            isMvpBoundary: item.isMvpBoundary ? 1 : 0,
          })
          .where(eq(schema.milestones.id, prior.id))
          .run()
      } else {
        db.insert(schema.milestones)
          .values({
            id: crypto.randomUUID(),
            projectId,
            name: item.name,
            description: item.description ?? null,
            sortOrder: i,
            isMvpBoundary: item.isMvpBoundary ? 1 : 0,
            status: "pending",
          })
          .run()
      }
    }

    return db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.projectId, projectId))
      .orderBy(asc(schema.milestones.sortOrder))
      .all()
  }

  updateMilestoneStatus(
    milestoneId: string,
    status: MilestoneStatus,
  ): MilestoneRecord {
    const db = getDb()
    const milestone = db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.id, milestoneId))
      .get()

    if (!milestone) throw new Error(`Milestone ${milestoneId} not found`)

    const currentStatus = milestone.status as MilestoneStatus
    const allowed = MILESTONE_TRANSITIONS[currentStatus]
    if (!allowed.includes(status)) {
      throw new Error(
        `Invalid milestone transition: ${currentStatus} → ${status}`,
      )
    }

    const updates: Record<string, unknown> = { status }
    if (status === "completed") {
      updates.completedAt = new Date().toISOString()
    }

    db.update(schema.milestones)
      .set(updates)
      .where(eq(schema.milestones.id, milestoneId))
      .run()

    return db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.id, milestoneId))
      .get()!
  }

  getMilestones(projectId: string): MilestoneRecord[] {
    const db = getDb()
    return db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.projectId, projectId))
      .orderBy(asc(schema.milestones.sortOrder))
      .all()
  }

  getMilestoneWithChildren(milestoneId: string): MilestoneWithChildren {
    const db = getDb()
    const milestone = db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.id, milestoneId))
      .get()

    if (!milestone) throw new Error(`Milestone ${milestoneId} not found`)

    const phaseRecords = db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.milestoneId, milestoneId))
      .orderBy(asc(schema.phases.sortOrder))
      .all()

    const phasesWithTasks: PhaseWithTasks[] = phaseRecords.map((phase) => {
      const taskRecords = db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.phaseId, phase.id))
        .orderBy(asc(schema.tasks.sortOrder))
        .all()
      return { ...phase, tasks: taskRecords }
    })

    return { ...milestone, phases: phasesWithTasks }
  }

  // ── Phase operations ──

  createPhases(
    milestoneId: string,
    items: Array<{
      name: string
      description?: string
      exitCriteria?: string[]
    }>,
  ): PhaseRecord[] {
    const db = getDb()
    const results: PhaseRecord[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const id = crypto.randomUUID()
      db.insert(schema.phases)
        .values({
          id,
          milestoneId,
          name: item.name,
          description: item.description ?? null,
          exitCriteria: item.exitCriteria
            ? JSON.stringify(item.exitCriteria)
            : null,
          sortOrder: i,
          status: "pending",
        })
        .run()

      const record = db
        .select()
        .from(schema.phases)
        .where(eq(schema.phases.id, id))
        .get()!
      results.push(record)
    }

    return results
  }

  updatePhaseStatus(phaseId: string, status: PhaseStatus): PhaseRecord {
    const db = getDb()
    const phase = db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, phaseId))
      .get()

    if (!phase) throw new Error(`Phase ${phaseId} not found`)

    const currentStatus = phase.status as PhaseStatus
    const allowed = PHASE_TRANSITIONS[currentStatus]
    if (!allowed.includes(status)) {
      throw new Error(
        `Invalid phase transition: ${currentStatus} → ${status}`,
      )
    }

    const updates: Record<string, unknown> = { status }
    if (status === "completed") {
      updates.completedAt = new Date().toISOString()
    }

    db.update(schema.phases)
      .set(updates)
      .where(eq(schema.phases.id, phaseId))
      .run()

    if (status === "completed") {
      this.checkMilestoneCompletion(phase.milestoneId)
    }

    return db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, phaseId))
      .get()!
  }

  setPhaseReviewResult(
    phaseId: string,
    result: PhaseReviewResult,
  ): PhaseRecord {
    const db = getDb()
    db.update(schema.phases)
      .set({ reviewResult: JSON.stringify(result) })
      .where(eq(schema.phases.id, phaseId))
      .run()

    return db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, phaseId))
      .get()!
  }

  createFixUpTasks(
    phaseId: string,
    failedCriteria: FailedCriterion[],
  ): TaskRecord[] {
    const db = getDb()
    const existingTasks = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.phaseId, phaseId))
      .all()
    const startOrder = existingTasks.length

    const results: TaskRecord[] = []
    for (let i = 0; i < failedCriteria.length; i++) {
      const criterion = failedCriteria[i]
      const id = crypto.randomUUID()
      db.insert(schema.tasks)
        .values({
          id,
          phaseId,
          title: `Fix: ${criterion.criterion}`,
          description: criterion.suggestedFix ?? null,
          sortOrder: startOrder + i,
          status: "pending",
        })
        .run()

      const record = db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, id))
        .get()!
      results.push(record)
    }

    return results
  }

  getPhases(milestoneId: string): PhaseRecord[] {
    const db = getDb()
    return db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.milestoneId, milestoneId))
      .orderBy(asc(schema.phases.sortOrder))
      .all()
  }

  // ── Task operations ──

  createTasks(
    phaseId: string,
    items: Array<{
      title: string
      description?: string
      sourceDoc?: string
    }>,
  ): TaskRecord[] {
    const db = getDb()
    const results: TaskRecord[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const id = crypto.randomUUID()
      db.insert(schema.tasks)
        .values({
          id,
          phaseId,
          title: item.title,
          description: item.description ?? null,
          sourceDoc: item.sourceDoc ?? null,
          sortOrder: i,
          status: "pending",
        })
        .run()

      const record = db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, id))
        .get()!
      results.push(record)
    }

    return results
  }

  updateTaskStatus(taskId: string, status: TaskStatus): TaskRecord {
    const db = getDb()
    const task = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .get()

    if (!task) throw new Error(`Task ${taskId} not found`)

    const currentStatus = task.status as TaskStatus
    const allowed = TASK_TRANSITIONS[currentStatus]
    if (!allowed.includes(status)) {
      throw new Error(
        `Invalid task transition: ${currentStatus} → ${status}`,
      )
    }

    const updates: Record<string, unknown> = { status }
    if (status === "completed" || status === "skipped") {
      updates.completedAt = new Date().toISOString()
    }

    db.update(schema.tasks)
      .set(updates)
      .where(eq(schema.tasks.id, taskId))
      .run()

    if (status === "completed" || status === "skipped") {
      this.checkPhaseCompletion(task.phaseId)
    }

    return db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .get()!
  }

  getTasks(phaseId: string): TaskRecord[] {
    const db = getDb()
    return db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.phaseId, phaseId))
      .orderBy(asc(schema.tasks.sortOrder))
      .all()
  }

  getNextPendingTask(phaseId: string): TaskRecord | null {
    const db = getDb()
    return (
      db
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.phaseId, phaseId),
            eq(schema.tasks.status, "pending"),
          ),
        )
        .orderBy(asc(schema.tasks.sortOrder))
        .limit(1)
        .get() ?? null
    )
  }

  // ── Release operations ──

  createRelease(
    projectId: string,
    versionLabel: string,
    milestoneIds: string[],
    notes?: string,
  ): ReleaseRecord {
    const db = getDb()
    const id = crypto.randomUUID()

    db.insert(schema.releases)
      .values({
        id,
        projectId,
        versionLabel,
        notes: notes ?? null,
        status: "pending",
      })
      .run()

    for (const milestoneId of milestoneIds) {
      db.insert(schema.releaseMilestones)
        .values({ releaseId: id, milestoneId })
        .run()
    }

    return db
      .select()
      .from(schema.releases)
      .where(eq(schema.releases.id, id))
      .get()!
  }

  publishRelease(releaseId: string, tag?: string): ReleaseRecord {
    const db = getDb()
    const release = db
      .select()
      .from(schema.releases)
      .where(eq(schema.releases.id, releaseId))
      .get()

    if (!release) throw new Error(`Release ${releaseId} not found`)
    if (release.status !== "pending") {
      throw new Error(`Release ${releaseId} is not pending`)
    }

    db.update(schema.releases)
      .set({
        status: "published",
        tag: tag ?? null,
        publishedAt: new Date().toISOString(),
      })
      .where(eq(schema.releases.id, releaseId))
      .run()

    return db
      .select()
      .from(schema.releases)
      .where(eq(schema.releases.id, releaseId))
      .get()!
  }

  getReleases(projectId: string): ReleaseRecord[] {
    const db = getDb()
    return db
      .select()
      .from(schema.releases)
      .where(eq(schema.releases.projectId, projectId))
      .all()
  }

  getReleaseMilestoneIds(releaseId: string): string[] {
    const db = getDb()
    return db
      .select({ milestoneId: schema.releaseMilestones.milestoneId })
      .from(schema.releaseMilestones)
      .where(eq(schema.releaseMilestones.releaseId, releaseId))
      .all()
      .map((r) => r.milestoneId)
  }

  // ── Task extraction ──

  extractTasksFromDesignDocs(
    milestoneId: string,
    workspacePath: string,
  ): TaskRecord[] {
    const fs = require("node:fs") as typeof import("node:fs")
    const path = require("node:path") as typeof import("node:path")

    const designDir = path.join(workspacePath, "docs", "detailed_design")
    if (!fs.existsSync(designDir)) return []

    const allTasks: TaskRecord[] = []
    const entries = fs.readdirSync(designDir, { withFileTypes: true })
    const phaseDirs = entries
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .sort((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name),
      )

    for (const phaseDir of phaseDirs) {
      const phaseName = (phaseDir as { name: string }).name.replace(/_/g, " ")
      const phasePath = path.join(designDir, (phaseDir as { name: string }).name)

      // Parse exit criteria from design docs in this phase directory
      const exitCriteria: string[] = []
      const taskItems: Array<{
        title: string
        description?: string
        sourceDoc: string
      }> = []

      const mdFiles = fs
        .readdirSync(phasePath)
        .filter((f: string) => f.endsWith(".md"))
        .sort()

      for (const mdFile of mdFiles) {
        const filePath = path.join(phasePath, mdFile)
        const content = fs.readFileSync(filePath, "utf-8")
        const relPath = path.relative(
          workspacePath,
          filePath,
        )

        // Parse tasks: checkbox format
        const checkboxRe = /^- \[ \] (.+)$/gm
        let match
        while ((match = checkboxRe.exec(content)) !== null) {
          taskItems.push({ title: match[1].trim(), sourceDoc: relPath })
        }

        // Parse tasks: table format (| Task | Description |)
        const tableRe =
          /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm
        let tableMatch
        let isHeader = true
        while ((tableMatch = tableRe.exec(content)) !== null) {
          const col1 = tableMatch[1].trim()
          const col2 = tableMatch[2].trim()
          // Skip header and separator rows
          if (isHeader || col1.startsWith("-") || col1.toLowerCase() === "task") {
            isHeader = false
            continue
          }
          taskItems.push({
            title: col1,
            description: col2,
            sourceDoc: relPath,
          })
        }

        // Parse exit criteria
        const exitRe = /^## Exit Criteria\s*\n([\s\S]*?)(?=\n##|\n$|$)/m
        const exitMatch = content.match(exitRe)
        if (exitMatch) {
          const criteriaLines = exitMatch[1]
            .split("\n")
            .filter((l: string) => l.startsWith("- "))
            .map((l: string) => l.slice(2).trim())
          exitCriteria.push(...criteriaLines)
        }
      }

      // Create the phase
      const createdPhases = this.createPhases(milestoneId, [
        {
          name: phaseName,
          exitCriteria: exitCriteria.length > 0 ? exitCriteria : undefined,
        },
      ])
      const phase = createdPhases[0]

      // Create tasks for this phase
      if (taskItems.length > 0) {
        const created = this.createTasks(phase.id, taskItems)
        allTasks.push(...created)
      }
    }

    return allTasks
  }

  // ── Cascade logic ──

  checkPhaseCompletion(phaseId: string): boolean {
    const db = getDb()
    const tasks = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.phaseId, phaseId))
      .all()

    if (tasks.length === 0) return false

    const allDone = tasks.every(
      (t) => t.status === "completed" || t.status === "skipped",
    )

    if (allDone) {
      const phase = db
        .select()
        .from(schema.phases)
        .where(eq(schema.phases.id, phaseId))
        .get()

      if (phase && phase.status === "active") {
        db.update(schema.phases)
          .set({ status: "reviewing" })
          .where(eq(schema.phases.id, phaseId))
          .run()
        return true
      }
    }

    return false
  }

  checkMilestoneCompletion(milestoneId: string): boolean {
    const db = getDb()
    const allPhases = db
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.milestoneId, milestoneId))
      .all()

    if (allPhases.length === 0) return false

    const allCompleted = allPhases.every((p) => p.status === "completed")

    if (allCompleted) {
      const milestone = db
        .select()
        .from(schema.milestones)
        .where(eq(schema.milestones.id, milestoneId))
        .get()

      if (milestone && milestone.status === "active") {
        db.update(schema.milestones)
          .set({
            status: "completed",
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.milestones.id, milestoneId))
          .run()
        return true
      }
    }

    return false
  }

  // ── Query helpers ──

  getProjectDeliveryTree(projectId: string): ProjectDeliveryTree {
    const milestoneRecords = this.getMilestones(projectId)
    const milestonesWithChildren: MilestoneWithChildren[] =
      milestoneRecords.map((m) => this.getMilestoneWithChildren(m.id))

    return {
      milestones: milestonesWithChildren,
      progress: this.getProjectProgress(projectId),
    }
  }

  getProjectProgress(projectId: string): ProjectProgress {
    const db = getDb()
    const allMilestones = this.getMilestones(projectId)

    let totalTasks = 0
    let completedTasks = 0

    for (const milestone of allMilestones) {
      const phases = db
        .select()
        .from(schema.phases)
        .where(eq(schema.phases.milestoneId, milestone.id))
        .all()

      for (const phase of phases) {
        const tasks = db
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.phaseId, phase.id))
          .all()

        totalTasks += tasks.length
        completedTasks += tasks.filter(
          (t) => t.status === "completed" || t.status === "skipped",
        ).length
      }
    }

    const currentMilestone =
      allMilestones.find((m) => m.status === "active") ?? null
    let currentPhase: PhaseRecord | null = null
    if (currentMilestone) {
      const phases = db
        .select()
        .from(schema.phases)
        .where(eq(schema.phases.milestoneId, currentMilestone.id))
        .orderBy(asc(schema.phases.sortOrder))
        .all()
      currentPhase = phases.find((p) => p.status === "active") ?? null
    }

    return {
      totalMilestones: allMilestones.length,
      completedMilestones: allMilestones.filter(
        (m) => m.status === "completed",
      ).length,
      totalTasks,
      completedTasks,
      currentMilestone,
      currentPhase,
    }
  }

  // ── Phase rejection helper ──

  resetPhaseForRework(phaseId: string): void {
    const db = getDb()
    const tasks = db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.phaseId, phaseId))
      .all()

    for (const task of tasks) {
      if (task.status === "completed" || task.status === "failed") {
        db.update(schema.tasks)
          .set({ status: "pending", completedAt: null })
          .where(eq(schema.tasks.id, task.id))
          .run()
      }
    }

    db.update(schema.phases)
      .set({ status: "active", completedAt: null, reviewResult: null })
      .where(eq(schema.phases.id, phaseId))
      .run()
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

const DELIVERY_TRACKER_KEY = Symbol.for("auteng.deliveryTracker")

export function getDeliveryTracker(): DeliveryTracker {
  const g = globalThis as Record<symbol, DeliveryTracker | undefined>
  if (!g[DELIVERY_TRACKER_KEY]) {
    g[DELIVERY_TRACKER_KEY] = new DeliveryTracker()
  }
  return g[DELIVERY_TRACKER_KEY]
}
