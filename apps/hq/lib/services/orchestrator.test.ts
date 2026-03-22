import { describe, it, expect, vi, beforeEach } from "vitest"
import { createTestDb, seedProject } from "@/lib/test-helpers"

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

const EXPECTED_ERROR = "Use delivery tracker and milestones API for phase management"

describe("Orchestrator", () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  it("startPhase throws with migration message", async () => {
    const project = seedProject(testDb, {})

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    await expect(orch.startPhase(project.id, 1)).rejects.toThrow(EXPECTED_ERROR)
  })

  it("handlePhaseAction throws with migration message", async () => {
    const project = seedProject(testDb, {})

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    await expect(orch.handlePhaseAction(project.id, 1, "approve")).rejects.toThrow(EXPECTED_ERROR)
  })

  it("markPhaseForReview throws with migration message", async () => {
    const project = seedProject(testDb, {})

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    await expect(orch.markPhaseForReview(project.id, 1)).rejects.toThrow(EXPECTED_ERROR)
  })

  it("stopPhase throws with migration message", async () => {
    const project = seedProject(testDb, {})

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    await expect(orch.stopPhase(project.id, 1)).rejects.toThrow(EXPECTED_ERROR)
  })
})
