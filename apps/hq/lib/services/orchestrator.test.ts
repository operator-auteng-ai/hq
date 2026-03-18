import { describe, it, expect, vi, beforeEach } from "vitest"
import { createTestDb, seedProject } from "@/lib/test-helpers"
import * as schema from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Store reference to test DB for mock
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

vi.mock("@/lib/process/agent-manager", () => ({
  getAgentManager: () => ({
    spawn: vi.fn().mockResolvedValue(undefined),
    listByProject: vi.fn().mockReturnValue([]),
    cancel: vi.fn(),
  }),
}))

vi.mock("@/lib/process/background-process-manager", () => ({
  getBackgroundProcessManager: () => ({
    stopAllForProject: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock("uuid", () => ({
  v4: () => "mock-uuid-1234",
}))

describe("Orchestrator", () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  it("handlePhaseAction approve marks phase completed", async () => {
    const project = seedProject(testDb)

    testDb
      .insert(schema.phases)
      .values({
        id: "phase-1",
        projectId: project.id,
        phaseNumber: 1,
        name: "Skeleton",
        status: "review",
      })
      .run()

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    const result = await orch.handlePhaseAction(project.id, "phase-1", "approve")

    const phase = testDb
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, "phase-1"))
      .get()

    expect(phase!.status).toBe("completed")
    expect(phase!.completedAt).toBeDefined()
    expect(result.nextPhaseId).toBeUndefined() // No next phase
  })

  it("handlePhaseAction approve returns next phase if exists", async () => {
    const project = seedProject(testDb)

    testDb
      .insert(schema.phases)
      .values([
        {
          id: "phase-1",
          projectId: project.id,
          phaseNumber: 1,
          name: "Skeleton",
          status: "review",
        },
        {
          id: "phase-2",
          projectId: project.id,
          phaseNumber: 2,
          name: "Features",
          status: "pending",
        },
      ])
      .run()

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    const result = await orch.handlePhaseAction(project.id, "phase-1", "approve")
    expect(result.nextPhaseId).toBe("phase-2")
  })

  it("handlePhaseAction reject resets phase to active", async () => {
    const project = seedProject(testDb)

    testDb
      .insert(schema.phases)
      .values({
        id: "phase-1",
        projectId: project.id,
        phaseNumber: 1,
        name: "Skeleton",
        status: "review",
      })
      .run()

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    await orch.handlePhaseAction(project.id, "phase-1", "reject")

    const phase = testDb
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, "phase-1"))
      .get()

    expect(phase!.status).toBe("active")
  })

  it("handlePhaseAction skip marks completed and advances", async () => {
    const project = seedProject(testDb)

    testDb
      .insert(schema.phases)
      .values([
        {
          id: "phase-1",
          projectId: project.id,
          phaseNumber: 1,
          name: "Skeleton",
          status: "review",
        },
        {
          id: "phase-2",
          projectId: project.id,
          phaseNumber: 2,
          name: "Features",
          status: "pending",
        },
      ])
      .run()

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    const result = await orch.handlePhaseAction(project.id, "phase-1", "skip")

    const phase = testDb
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, "phase-1"))
      .get()

    expect(phase!.status).toBe("completed")
    expect(result.nextPhaseId).toBe("phase-2")
  })

  it("markPhaseForReview sets status to review", async () => {
    const project = seedProject(testDb)

    testDb
      .insert(schema.phases)
      .values({
        id: "phase-1",
        projectId: project.id,
        phaseNumber: 1,
        name: "Skeleton",
        status: "active",
      })
      .run()

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    await orch.markPhaseForReview("phase-1")

    const phase = testDb
      .select()
      .from(schema.phases)
      .where(eq(schema.phases.id, "phase-1"))
      .get()

    expect(phase!.status).toBe("review")
  })
})
