import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createTestDb, seedProject } from "@/lib/test-helpers"
import * as schema from "@/lib/db/schema"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Store reference to test DB for mock
let testDb: ReturnType<typeof createTestDb>
let tmpDir: string

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

const PLAN_MD = `# Plan

### Phase 1: Skeleton
**From**: Nothing
**To**: Basic app

**Exit Criteria**:
- App launches
- Tests pass

### Phase 2: Features
**From**: Skeleton
**To**: Full features

**Exit Criteria**:
- All features work
`

function setupWorkspace(workspacePath: string) {
  const docsDir = path.join(workspacePath, "docs")
  fs.mkdirSync(docsDir, { recursive: true })
  fs.writeFileSync(path.join(docsDir, "PLAN.md"), PLAN_MD)
}

describe("Orchestrator", () => {
  beforeEach(() => {
    testDb = createTestDb()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-test-"))
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("handlePhaseAction approve logs to PLAN_PROGRESS_LOG.md", async () => {
    const workspacePath = path.join(tmpDir, "project")
    setupWorkspace(workspacePath)
    const project = seedProject(testDb, { workspacePath })

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    const result = await orch.handlePhaseAction(project.id, 1, "approve")

    const logPath = path.join(workspacePath, "docs", "PLAN_PROGRESS_LOG.md")
    expect(fs.existsSync(logPath)).toBe(true)
    const log = fs.readFileSync(logPath, "utf-8")
    expect(log).toContain("Phase 1 completed")
    expect(log).toContain("Skeleton")
    expect(result.nextPhaseNumber).toBe(2)
  })

  it("handlePhaseAction approve with no next phase returns undefined", async () => {
    const workspacePath = path.join(tmpDir, "project2")
    setupWorkspace(workspacePath)
    const project = seedProject(testDb, { workspacePath })

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    const result = await orch.handlePhaseAction(project.id, 2, "approve")
    expect(result.nextPhaseNumber).toBeUndefined()
  })

  it("handlePhaseAction reject logs rejection", async () => {
    const workspacePath = path.join(tmpDir, "project3")
    setupWorkspace(workspacePath)
    const project = seedProject(testDb, { workspacePath })

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    await orch.handlePhaseAction(project.id, 1, "reject")

    const logPath = path.join(workspacePath, "docs", "PLAN_PROGRESS_LOG.md")
    const log = fs.readFileSync(logPath, "utf-8")
    expect(log).toContain("Phase 1 rejected")
  })

  it("handlePhaseAction skip logs and advances", async () => {
    const workspacePath = path.join(tmpDir, "project4")
    setupWorkspace(workspacePath)
    const project = seedProject(testDb, { workspacePath })

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    const result = await orch.handlePhaseAction(project.id, 1, "skip")

    const logPath = path.join(workspacePath, "docs", "PLAN_PROGRESS_LOG.md")
    const log = fs.readFileSync(logPath, "utf-8")
    expect(log).toContain("Phase 1 skipped")
    expect(result.nextPhaseNumber).toBe(2)
  })

  it("markPhaseForReview logs review status", async () => {
    const workspacePath = path.join(tmpDir, "project5")
    setupWorkspace(workspacePath)
    const project = seedProject(testDb, { workspacePath })

    const { Orchestrator } = await import("./orchestrator")
    const orch = new Orchestrator()

    await orch.markPhaseForReview(project.id, 1)

    const logPath = path.join(workspacePath, "docs", "PLAN_PROGRESS_LOG.md")
    const log = fs.readFileSync(logPath, "utf-8")
    expect(log).toContain("Phase 1 pending review")
  })
})
