import { describe, it, expect, vi, beforeEach } from "vitest"
import { createTestDb, seedProject } from "@/lib/test-helpers"
import * as schema from "@/lib/db/schema"
import { eq } from "drizzle-orm"

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

const mockSpawn = vi.fn().mockResolvedValue(undefined)
const mockOnComplete = vi.fn()
const mockWaitForAgent = vi.fn().mockResolvedValue("completed")

vi.mock("@/lib/process/agent-manager", () => ({
  getAgentManager: () => ({
    spawn: mockSpawn,
    onComplete: mockOnComplete,
    waitForAgent: mockWaitForAgent,
    listByProject: vi.fn().mockReturnValue([]),
    cancel: vi.fn(),
  }),
}))

vi.mock("@/lib/services/secrets", () => ({
  getAnthropicApiKey: () => "sk-test-key",
}))

vi.mock("@/lib/services/planning-engine", () => ({
  getPlanningEngine: () => ({
    runSkill: vi.fn().mockResolvedValue({ success: true, agentId: "mock-skill-agent" }),
  }),
  milestoneToArchDir: (name: string) =>
    name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
}))

function seedDeliveryData(projectId: string) {
  const milestoneId = crypto.randomUUID()
  testDb
    .insert(schema.milestones)
    .values({
      id: milestoneId,
      projectId,
      name: "M1",
      sortOrder: 0,
      status: "pending",
    })
    .run()

  const phaseId = crypto.randomUUID()
  testDb
    .insert(schema.phases)
    .values({
      id: phaseId,
      milestoneId,
      name: "Phase 1",
      sortOrder: 0,
      status: "pending",
    })
    .run()

  const task1Id = crypto.randomUUID()
  const task2Id = crypto.randomUUID()
  testDb
    .insert(schema.tasks)
    .values({
      id: task1Id,
      phaseId,
      title: "Task 1",
      description: "First task",
      sortOrder: 0,
      status: "pending",
    })
    .run()
  testDb
    .insert(schema.tasks)
    .values({
      id: task2Id,
      phaseId,
      title: "Task 2",
      sortOrder: 1,
      status: "pending",
    })
    .run()

  return { milestoneId, phaseId, task1Id, task2Id }
}

describe("Orchestrator", () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  describe("startTask", () => {
    it("spawns agent and updates statuses", async () => {
      const project = seedProject(testDb, {
        workspacePath: "/tmp/test",
        status: "building",
      })
      const { task1Id, phaseId, milestoneId } = seedDeliveryData(project.id)

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      const result = await orch.startTask(task1Id)

      expect(result.agentId).toBeDefined()
      expect(mockSpawn).toHaveBeenCalled()

      // Task should be in_progress
      const task = testDb
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, task1Id))
        .get()
      expect(task!.status).toBe("in_progress")

      // Phase should be active
      const phase = testDb
        .select()
        .from(schema.phases)
        .where(eq(schema.phases.id, phaseId))
        .get()
      expect(phase!.status).toBe("active")

      // Milestone should be active
      const milestone = testDb
        .select()
        .from(schema.milestones)
        .where(eq(schema.milestones.id, milestoneId))
        .get()
      expect(milestone!.status).toBe("active")

      // Should register completion callback
      expect(mockOnComplete).toHaveBeenCalledWith(
        result.agentId,
        expect.any(Function),
      )
    })

    it("builds prompt with task context", async () => {
      const project = seedProject(testDb, {
        workspacePath: "/tmp/test",
        name: "Test Project",
        prompt: "Build a SaaS",
      })
      const { task1Id } = seedDeliveryData(project.id)

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      await orch.startTask(task1Id)

      // Check the prompt passed to spawn
      const spawnCall = mockSpawn.mock.calls[0]
      const prompt = spawnCall[2] as string
      expect(prompt).toContain("Test Project")
      expect(prompt).toContain("Build a SaaS")
      expect(prompt).toContain("M1")
      expect(prompt).toContain("Phase 1")
      expect(prompt).toContain("Task 1")
    })

    it("creates agent_runs record with task_id", async () => {
      const project = seedProject(testDb, {
        workspacePath: "/tmp/test",
      })
      const { task1Id } = seedDeliveryData(project.id)

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      const result = await orch.startTask(task1Id)

      const agentRun = testDb
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, result.agentId))
        .get()
      expect(agentRun!.taskId).toBe(task1Id)
      expect(agentRun!.projectId).toBe(project.id)
    })
  })

  describe("onAgentCompleted", () => {
    it("updates task status on success", async () => {
      const project = seedProject(testDb, {
        workspacePath: "/tmp/test",
      })
      const { task1Id } = seedDeliveryData(project.id)

      // Create an agent_runs record linked to the task
      const agentId = crypto.randomUUID()
      testDb
        .insert(schema.agentRuns)
        .values({
          id: agentId,
          projectId: project.id,
          taskId: task1Id,
          agentType: "claude_code",
          prompt: "test",
          status: "completed",
        })
        .run()

      // Set task to in_progress first
      testDb
        .update(schema.tasks)
        .set({ status: "in_progress" })
        .where(eq(schema.tasks.id, task1Id))
        .run()

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      await orch.onAgentCompleted(agentId, "completed")

      const task = testDb
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, task1Id))
        .get()
      expect(task!.status).toBe("completed")
    })

    it("ignores agents without task_id", async () => {
      const project = seedProject(testDb)
      const agentId = crypto.randomUUID()
      testDb
        .insert(schema.agentRuns)
        .values({
          id: agentId,
          projectId: project.id,
          agentType: "claude_code",
          prompt: "planning",
          status: "completed",
        })
        .run()

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      // Should not throw
      await orch.onAgentCompleted(agentId, "completed")
    })
  })

  describe("startPhase", () => {
    it("starts first pending task in phase", async () => {
      const project = seedProject(testDb, {
        workspacePath: "/tmp/test",
      })
      const { phaseId } = seedDeliveryData(project.id)

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      const result = await orch.startPhase(phaseId)

      expect(result.agentId).toBeDefined()
      expect(mockSpawn).toHaveBeenCalled()
    })

    it("throws when no pending tasks", async () => {
      const project = seedProject(testDb, {
        workspacePath: "/tmp/test",
      })
      const { phaseId, task1Id, task2Id } = seedDeliveryData(project.id)

      // Mark all tasks as completed
      testDb
        .update(schema.tasks)
        .set({ status: "completed" })
        .where(eq(schema.tasks.id, task1Id))
        .run()
      testDb
        .update(schema.tasks)
        .set({ status: "completed" })
        .where(eq(schema.tasks.id, task2Id))
        .run()

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      await expect(orch.startPhase(phaseId)).rejects.toThrow(
        "No pending tasks",
      )
    })
  })

  describe("approvePhase", () => {
    it("completes a reviewing phase and finds next", async () => {
      const project = seedProject(testDb, {
        workspacePath: "/tmp/test",
      })
      const milestoneId = crypto.randomUUID()
      testDb
        .insert(schema.milestones)
        .values({
          id: milestoneId,
          projectId: project.id,
          name: "M1",
          sortOrder: 0,
          status: "active",
        })
        .run()

      const phase1Id = crypto.randomUUID()
      const phase2Id = crypto.randomUUID()
      testDb
        .insert(schema.phases)
        .values({
          id: phase1Id,
          milestoneId,
          name: "P1",
          sortOrder: 0,
          status: "reviewing",
        })
        .run()
      testDb
        .insert(schema.phases)
        .values({
          id: phase2Id,
          milestoneId,
          name: "P2",
          sortOrder: 1,
          status: "pending",
        })
        .run()

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      const result = await orch.approvePhase(phase1Id)

      expect(result.nextPhaseId).toBe(phase2Id)

      const phase = testDb
        .select()
        .from(schema.phases)
        .where(eq(schema.phases.id, phase1Id))
        .get()
      expect(phase!.status).toBe("completed")
    })
  })

  describe("rejectPhase", () => {
    it("resets tasks to pending", async () => {
      const project = seedProject(testDb)
      const milestoneId = crypto.randomUUID()
      testDb
        .insert(schema.milestones)
        .values({
          id: milestoneId,
          projectId: project.id,
          name: "M1",
          sortOrder: 0,
          status: "active",
        })
        .run()

      const phaseId = crypto.randomUUID()
      testDb
        .insert(schema.phases)
        .values({
          id: phaseId,
          milestoneId,
          name: "P1",
          sortOrder: 0,
          status: "active",
        })
        .run()

      const taskId = crypto.randomUUID()
      testDb
        .insert(schema.tasks)
        .values({
          id: taskId,
          phaseId,
          title: "T1",
          sortOrder: 0,
          status: "completed",
        })
        .run()

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      await orch.rejectPhase(phaseId)

      const task = testDb
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId))
        .get()
      expect(task!.status).toBe("pending")
    })
  })

  describe("approveMilestone", () => {
    it("completes milestone and finds next", async () => {
      const project = seedProject(testDb, {
        workspacePath: "/tmp/test",
      })

      const m1Id = crypto.randomUUID()
      const m2Id = crypto.randomUUID()
      testDb
        .insert(schema.milestones)
        .values({
          id: m1Id,
          projectId: project.id,
          name: "M1",
          sortOrder: 0,
          status: "active",
        })
        .run()
      testDb
        .insert(schema.milestones)
        .values({
          id: m2Id,
          projectId: project.id,
          name: "M2",
          sortOrder: 1,
          status: "pending",
        })
        .run()

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      const result = await orch.approveMilestone(m1Id)

      expect(result.nextMilestoneId).toBe(m2Id)

      const milestone = testDb
        .select()
        .from(schema.milestones)
        .where(eq(schema.milestones.id, m1Id))
        .get()
      expect(milestone!.status).toBe("completed")
    })
  })

  describe("skipPhase", () => {
    it("skips all tasks and completes phase", async () => {
      const project = seedProject(testDb)
      const milestoneId = crypto.randomUUID()
      testDb
        .insert(schema.milestones)
        .values({
          id: milestoneId,
          projectId: project.id,
          name: "M1",
          sortOrder: 0,
          status: "active",
        })
        .run()

      const phaseId = crypto.randomUUID()
      testDb
        .insert(schema.phases)
        .values({
          id: phaseId,
          milestoneId,
          name: "P1",
          sortOrder: 0,
          status: "active",
        })
        .run()

      const taskId = crypto.randomUUID()
      testDb
        .insert(schema.tasks)
        .values({
          id: taskId,
          phaseId,
          title: "T1",
          sortOrder: 0,
          status: "pending",
        })
        .run()

      const { Orchestrator } = await import("./orchestrator")
      const orch = new Orchestrator()

      await orch.skipPhase(phaseId)

      const task = testDb
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId))
        .get()
      expect(task!.status).toBe("skipped")

      const phase = testDb
        .select()
        .from(schema.phases)
        .where(eq(schema.phases.id, phaseId))
        .get()
      expect(phase!.status).toBe("completed")
    })
  })
})
