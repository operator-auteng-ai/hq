import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createTestDb, seedProject } from "@/lib/test-helpers"
import * as schema from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { vi } from "vitest"

let testDb: ReturnType<typeof createTestDb>

vi.mock("@/lib/db", async () => {
  const actualSchema = await vi.importActual<typeof import("@/lib/db/schema")>(
    "@/lib/db/schema",
  )
  return {
    getDb: () => testDb,
    schema: actualSchema,
  }
})

describe("DeliveryTracker", () => {
  let tracker: InstanceType<
    typeof import("./delivery-tracker").DeliveryTracker
  >

  beforeEach(async () => {
    testDb = createTestDb()
    vi.clearAllMocks()
    const mod = await import("./delivery-tracker")
    tracker = new mod.DeliveryTracker()
  })

  describe("Milestone CRUD", () => {
    it("creates milestones for a project, ordered with MVP boundary", () => {
      const project = seedProject(testDb)
      const milestones = tracker.createMilestones(project.id, [
        { name: "Core invoicing" },
        { name: "Payments" },
        { name: "Dashboard", isMvpBoundary: true },
      ])

      expect(milestones).toHaveLength(3)
      expect(milestones[0].name).toBe("Core invoicing")
      expect(milestones[0].sortOrder).toBe(0)
      expect(milestones[0].isMvpBoundary).toBe(0)
      expect(milestones[2].name).toBe("Dashboard")
      expect(milestones[2].sortOrder).toBe(2)
      expect(milestones[2].isMvpBoundary).toBe(1)
    })

    it("getMilestones returns ordered", () => {
      const project = seedProject(testDb)
      tracker.createMilestones(project.id, [
        { name: "M1" },
        { name: "M2" },
      ])
      const result = tracker.getMilestones(project.id)
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("M1")
      expect(result[1].name).toBe("M2")
    })
  })

  describe("Phase CRUD", () => {
    it("creates phases for a milestone with descriptive names", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const phases = tracker.createPhases(milestone.id, [
        { name: "Data Model & API" },
        { name: "Payment Flow" },
        {
          name: "Error Handling & Tests",
          exitCriteria: ["All tests pass", "No lint errors"],
        },
      ])

      expect(phases).toHaveLength(3)
      expect(phases[0].name).toBe("Data Model & API")
      expect(phases[2].exitCriteria).toBe(
        JSON.stringify(["All tests pass", "No lint errors"]),
      )
    })
  })

  describe("Task CRUD", () => {
    it("creates tasks for a phase with source_doc", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [
        { name: "Schema" },
      ])
      const tasks = tracker.createTasks(phase.id, [
        {
          title: "Create payments table",
          description: "Add migration",
          sourceDoc: "docs/detailed_design/Schema/payments.md",
        },
        { title: "Stripe SDK setup" },
      ])

      expect(tasks).toHaveLength(2)
      expect(tasks[0].title).toBe("Create payments table")
      expect(tasks[0].sourceDoc).toBe(
        "docs/detailed_design/Schema/payments.md",
      )
      expect(tasks[0].sortOrder).toBe(0)
      expect(tasks[1].sortOrder).toBe(1)
    })

    it("getNextPendingTask returns first pending task", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [
        { name: "Phase" },
      ])
      tracker.createTasks(phase.id, [
        { title: "Task 1" },
        { title: "Task 2" },
      ])

      const next = tracker.getNextPendingTask(phase.id)
      expect(next).not.toBeNull()
      expect(next!.title).toBe("Task 1")
    })
  })

  describe("Milestone status transitions", () => {
    it("allows valid transitions", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])

      expect(milestone.status).toBe("pending")

      const active = tracker.updateMilestoneStatus(milestone.id, "active")
      expect(active.status).toBe("active")

      const completed = tracker.updateMilestoneStatus(
        milestone.id,
        "completed",
      )
      expect(completed.status).toBe("completed")
      expect(completed.completedAt).not.toBeNull()
    })

    it("throws on invalid transition", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])

      expect(() =>
        tracker.updateMilestoneStatus(milestone.id, "completed"),
      ).toThrow("Invalid milestone transition: pending → completed")
    })

    it("allows failed → active (retry)", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      tracker.updateMilestoneStatus(milestone.id, "active")
      tracker.updateMilestoneStatus(milestone.id, "failed")

      const retried = tracker.updateMilestoneStatus(milestone.id, "active")
      expect(retried.status).toBe("active")
    })
  })

  describe("Phase status transitions", () => {
    it("allows full lifecycle: pending → active → reviewing → completed", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])

      tracker.updatePhaseStatus(phase.id, "active")
      tracker.updatePhaseStatus(phase.id, "reviewing")
      const completed = tracker.updatePhaseStatus(phase.id, "completed")
      expect(completed.status).toBe("completed")
    })

    it("allows review_failed → active (fix-up loop)", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])

      tracker.updatePhaseStatus(phase.id, "active")
      tracker.updatePhaseStatus(phase.id, "reviewing")
      tracker.updatePhaseStatus(phase.id, "review_failed")
      const reactivated = tracker.updatePhaseStatus(phase.id, "active")
      expect(reactivated.status).toBe("active")
    })

    it("throws on invalid transition", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])

      expect(() =>
        tracker.updatePhaseStatus(phase.id, "completed"),
      ).toThrow("Invalid phase transition: pending → completed")
    })
  })

  describe("Task status transitions", () => {
    it("allows pending → in_progress → completed", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])
      const [task] = tracker.createTasks(phase.id, [{ title: "T1" }])

      tracker.updateTaskStatus(task.id, "in_progress")
      const completed = tracker.updateTaskStatus(task.id, "completed")
      expect(completed.status).toBe("completed")
      expect(completed.completedAt).not.toBeNull()
    })

    it("allows pending → skipped", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])
      const [task] = tracker.createTasks(phase.id, [{ title: "T1" }])

      const skipped = tracker.updateTaskStatus(task.id, "skipped")
      expect(skipped.status).toBe("skipped")
    })

    it("allows failed → in_progress (retry)", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])
      const [task] = tracker.createTasks(phase.id, [{ title: "T1" }])

      tracker.updateTaskStatus(task.id, "in_progress")
      tracker.updateTaskStatus(task.id, "failed")
      const retried = tracker.updateTaskStatus(task.id, "in_progress")
      expect(retried.status).toBe("in_progress")
    })

    it("throws on invalid transition", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])
      const [task] = tracker.createTasks(phase.id, [{ title: "T1" }])

      expect(() =>
        tracker.updateTaskStatus(task.id, "completed"),
      ).toThrow("Invalid task transition: pending → completed")
    })
  })

  describe("Task→phase cascade", () => {
    it("all tasks completed → phase transitions to reviewing", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])
      const tasks = tracker.createTasks(phase.id, [
        { title: "T1" },
        { title: "T2" },
      ])

      // Activate phase first
      tracker.updatePhaseStatus(phase.id, "active")

      // Complete first task — phase stays active
      tracker.updateTaskStatus(tasks[0].id, "in_progress")
      tracker.updateTaskStatus(tasks[0].id, "completed")
      const phaseAfterFirst = testDb
        .select()
        .from(schema.phases)
        .where(
          eq(schema.phases.id, phase.id),
        )
        .get()
      expect(phaseAfterFirst!.status).toBe("active")

      // Complete second task — phase transitions to reviewing
      tracker.updateTaskStatus(tasks[1].id, "in_progress")
      tracker.updateTaskStatus(tasks[1].id, "completed")
      const phaseAfterAll = testDb
        .select()
        .from(schema.phases)
        .where(
          eq(schema.phases.id, phase.id),
        )
        .get()
      expect(phaseAfterAll!.status).toBe("reviewing")
    })

    it("skipped tasks don't block phase completion", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])
      const tasks = tracker.createTasks(phase.id, [
        { title: "T1" },
        { title: "T2" },
      ])

      tracker.updatePhaseStatus(phase.id, "active")
      tracker.updateTaskStatus(tasks[0].id, "in_progress")
      tracker.updateTaskStatus(tasks[0].id, "completed")
      tracker.updateTaskStatus(tasks[1].id, "skipped")

      const phaseAfter = testDb
        .select()
        .from(schema.phases)
        .where(
          eq(schema.phases.id, phase.id),
        )
        .get()
      expect(phaseAfter!.status).toBe("reviewing")
    })

    it("failed tasks keep phase active", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])
      const tasks = tracker.createTasks(phase.id, [
        { title: "T1" },
        { title: "T2" },
      ])

      tracker.updatePhaseStatus(phase.id, "active")
      tracker.updateTaskStatus(tasks[0].id, "in_progress")
      tracker.updateTaskStatus(tasks[0].id, "failed")

      const phaseAfter = testDb
        .select()
        .from(schema.phases)
        .where(
          eq(schema.phases.id, phase.id),
        )
        .get()
      expect(phaseAfter!.status).toBe("active")
    })
  })

  describe("Phase→milestone cascade", () => {
    it("all phases completed → milestone completes", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      tracker.updateMilestoneStatus(milestone.id, "active")

      const phases = tracker.createPhases(milestone.id, [
        { name: "P1" },
        { name: "P2" },
      ])

      // Complete both phases manually (simulating review pass)
      for (const phase of phases) {
        tracker.updatePhaseStatus(phase.id, "active")
        tracker.updatePhaseStatus(phase.id, "reviewing")
        tracker.updatePhaseStatus(phase.id, "completed")
      }

      const milestoneAfter = testDb
        .select()
        .from(schema.milestones)
        .where(
          eq(
            schema.milestones.id,
            milestone.id,
          ),
        )
        .get()
      expect(milestoneAfter!.status).toBe("completed")
    })
  })

  describe("Phase review", () => {
    it("stores review result on phase", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])

      const result = {
        timestamp: new Date().toISOString(),
        criteria: [
          {
            criterion: "Tests pass",
            passed: true,
            evidence: "All 5 tests pass",
          },
        ],
        testsRan: true,
        testsPassed: 5,
        testsFailed: 0,
        overallPass: true,
      }

      tracker.setPhaseReviewResult(phase.id, result)
      const updated = testDb
        .select()
        .from(schema.phases)
        .where(
          eq(schema.phases.id, phase.id),
        )
        .get()
      expect(JSON.parse(updated!.reviewResult!)).toEqual(result)
    })

    it("creates fix-up tasks from failed criteria", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])
      tracker.createTasks(phase.id, [{ title: "Original task" }])

      const fixUpTasks = tracker.createFixUpTasks(phase.id, [
        {
          criterion: "Status badge not imported",
          suggestedFix: "Import StatusBadge in invoice-list.tsx",
        },
      ])

      expect(fixUpTasks).toHaveLength(1)
      expect(fixUpTasks[0].title).toBe("Fix: Status badge not imported")
      expect(fixUpTasks[0].description).toBe(
        "Import StatusBadge in invoice-list.tsx",
      )
      expect(fixUpTasks[0].sortOrder).toBe(1) // After original task
    })

    it("force-approve allows completing a review_failed phase", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])

      tracker.updatePhaseStatus(phase.id, "active")
      tracker.updatePhaseStatus(phase.id, "reviewing")
      tracker.updatePhaseStatus(phase.id, "review_failed")

      // Force-approve: review_failed → completed is valid
      const completed = tracker.updatePhaseStatus(phase.id, "completed")
      expect(completed.status).toBe("completed")
    })
  })

  describe("Phase rejection", () => {
    it("resetPhaseForRework resets tasks and phase status", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])
      const [phase] = tracker.createPhases(milestone.id, [{ name: "P1" }])
      const tasks = tracker.createTasks(phase.id, [
        { title: "T1" },
        { title: "T2" },
      ])

      // Complete tasks
      tracker.updatePhaseStatus(phase.id, "active")
      tracker.updateTaskStatus(tasks[0].id, "in_progress")
      tracker.updateTaskStatus(tasks[0].id, "completed")
      tracker.updateTaskStatus(tasks[1].id, "in_progress")
      tracker.updateTaskStatus(tasks[1].id, "failed")

      // Reject
      tracker.resetPhaseForRework(phase.id)

      const phaseAfter = testDb
        .select()
        .from(schema.phases)
        .where(
          eq(schema.phases.id, phase.id),
        )
        .get()
      expect(phaseAfter!.status).toBe("active")

      const tasksAfter = tracker.getTasks(phase.id)
      expect(tasksAfter.every((t) => t.status === "pending")).toBe(true)
    })
  })

  describe("Release operations", () => {
    it("creates release linked to milestones", () => {
      const project = seedProject(testDb)
      const milestones = tracker.createMilestones(project.id, [
        { name: "M1" },
        { name: "M2" },
      ])

      const release = tracker.createRelease(
        project.id,
        "0.1.0",
        [milestones[0].id],
        "First release",
      )

      expect(release.versionLabel).toBe("0.1.0")
      expect(release.status).toBe("pending")
      expect(release.notes).toBe("First release")

      const linkedIds = tracker.getReleaseMilestoneIds(release.id)
      expect(linkedIds).toEqual([milestones[0].id])
    })

    it("publishes release with tag", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])

      const release = tracker.createRelease(project.id, "0.1.0", [
        milestone.id,
      ])
      const published = tracker.publishRelease(
        release.id,
        "0.1.0-20260322-abc1234",
      )

      expect(published.status).toBe("published")
      expect(published.tag).toBe("0.1.0-20260322-abc1234")
      expect(published.publishedAt).not.toBeNull()
    })
  })

  describe("Project delivery tree", () => {
    it("returns full nested tree with progress", () => {
      const project = seedProject(testDb)
      const milestones = tracker.createMilestones(project.id, [
        { name: "M1" },
        { name: "M2", isMvpBoundary: true },
      ])

      const phases = tracker.createPhases(milestones[0].id, [
        { name: "Schema" },
      ])
      tracker.createTasks(phases[0].id, [
        { title: "T1" },
        { title: "T2" },
      ])

      const tree = tracker.getProjectDeliveryTree(project.id)

      expect(tree.milestones).toHaveLength(2)
      expect(tree.milestones[0].phases).toHaveLength(1)
      expect(tree.milestones[0].phases[0].tasks).toHaveLength(2)
      expect(tree.progress.totalMilestones).toBe(2)
      expect(tree.progress.completedMilestones).toBe(0)
      expect(tree.progress.totalTasks).toBe(2)
      expect(tree.progress.completedTasks).toBe(0)
    })
  })

  describe("Task extraction from design docs", () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "extract-test-"))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it("extracts tasks from detailed_design directory structure", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])

      // Create design doc structure
      const designDir = path.join(tmpDir, "docs", "detailed_design")
      const schemaDir = path.join(designDir, "Data_Model")
      fs.mkdirSync(schemaDir, { recursive: true })

      fs.writeFileSync(
        path.join(schemaDir, "invoice-schema.md"),
        `# Invoice Schema

## Tasks
- [ ] Create invoices table
- [ ] Add migration
- [ ] Seed test data

## Exit Criteria
- Migration runs without errors
- Table has correct columns
`,
      )

      const tasks = tracker.extractTasksFromDesignDocs(milestone.id, tmpDir)

      expect(tasks).toHaveLength(3)
      expect(tasks[0].title).toBe("Create invoices table")
      expect(tasks[0].sourceDoc).toContain("detailed_design/Data_Model")

      // Check phase was created with exit criteria
      const phases = tracker.getPhases(milestone.id)
      expect(phases).toHaveLength(1)
      expect(phases[0].name).toBe("Data Model")
      const criteria = JSON.parse(phases[0].exitCriteria!)
      expect(criteria).toContain("Migration runs without errors")
    })

    it("creates multiple phases from multiple directories", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])

      const designDir = path.join(tmpDir, "docs", "detailed_design")
      const dir1 = path.join(designDir, "API_Routes")
      const dir2 = path.join(designDir, "UI_Components")
      fs.mkdirSync(dir1, { recursive: true })
      fs.mkdirSync(dir2, { recursive: true })

      fs.writeFileSync(
        path.join(dir1, "endpoints.md"),
        "## Tasks\n- [ ] GET endpoint\n- [ ] POST endpoint\n",
      )
      fs.writeFileSync(
        path.join(dir2, "forms.md"),
        "## Tasks\n- [ ] Invoice form\n",
      )

      tracker.extractTasksFromDesignDocs(milestone.id, tmpDir)

      const phases = tracker.getPhases(milestone.id)
      expect(phases).toHaveLength(2)
      expect(phases[0].name).toBe("API Routes")
      expect(phases[1].name).toBe("UI Components")

      const tasks1 = tracker.getTasks(phases[0].id)
      expect(tasks1).toHaveLength(2)
      const tasks2 = tracker.getTasks(phases[1].id)
      expect(tasks2).toHaveLength(1)
    })

    it("returns empty array if no detailed_design directory", () => {
      const project = seedProject(testDb)
      const [milestone] = tracker.createMilestones(project.id, [
        { name: "M1" },
      ])

      const tasks = tracker.extractTasksFromDesignDocs(milestone.id, tmpDir)
      expect(tasks).toHaveLength(0)
    })
  })
})
