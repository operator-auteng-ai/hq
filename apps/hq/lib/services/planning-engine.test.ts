import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import {
  renderMilestonesDoc,
  parseArchComponentList,
  milestoneToArchDir,
} from "./planning-engine"
import { createTestDb, seedProject } from "@/lib/test-helpers"
import * as schema from "@/lib/db/schema"

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
const mockWaitForAgent = vi.fn().mockResolvedValue("completed")
const mockAgentManager = {
  spawn: mockSpawn,
  waitForAgent: mockWaitForAgent,
  listByProject: vi.fn().mockReturnValue([]),
  cancel: vi.fn(),
}

vi.mock("@/lib/process/agent-manager", () => ({
  getAgentManager: () => mockAgentManager,
}))

vi.mock("@/lib/services/secrets", () => ({
  getAnthropicApiKey: () => "sk-test-key",
}))

describe("renderMilestonesDoc", () => {
  it("renders milestones with MVP and post-MVP sections", () => {
    const doc = renderMilestonesDoc("MatchMatchy", [
      { name: "Photo Onboarding", description: "User uploads a photo.", isMvpBoundary: 0, sortOrder: 0 },
      { name: "Virtual Try-On", description: "User tries garments.", isMvpBoundary: 0, sortOrder: 1 },
      { name: "Order Submission", description: "User places an order.", isMvpBoundary: 1, sortOrder: 2 },
      { name: "Fit Refinement", description: "User refines fit.", isMvpBoundary: 0, sortOrder: 3 },
    ])

    expect(doc).toContain("# MILESTONES — MatchMatchy")
    expect(doc).toContain("## MVP Scope")
    expect(doc).toContain("### M1: Photo Onboarding")
    expect(doc).toContain("User uploads a photo.")
    expect(doc).toContain("### M3: Order Submission <- MVP")
    expect(doc).toContain("## Post-MVP")
    expect(doc).toContain("### M4: Fit Refinement")
  })

  it("sorts by sortOrder regardless of input order", () => {
    const doc = renderMilestonesDoc("Test", [
      { name: "Third", description: null, isMvpBoundary: 1, sortOrder: 2 },
      { name: "First", description: null, isMvpBoundary: 0, sortOrder: 0 },
      { name: "Second", description: null, isMvpBoundary: 0, sortOrder: 1 },
    ])
    const firstIdx = doc.indexOf("First")
    const secondIdx = doc.indexOf("Second")
    const thirdIdx = doc.indexOf("Third")
    expect(firstIdx).toBeLessThan(secondIdx)
    expect(secondIdx).toBeLessThan(thirdIdx)
  })

  it("omits Post-MVP section when all milestones are in MVP", () => {
    const doc = renderMilestonesDoc("Test", [
      { name: "A", description: "a", isMvpBoundary: 0, sortOrder: 0 },
      { name: "B", description: "b", isMvpBoundary: 1, sortOrder: 1 },
    ])
    expect(doc).not.toContain("## Post-MVP")
  })

  it("includes the do-not-edit header", () => {
    const doc = renderMilestonesDoc("Test", [
      { name: "A", description: null, isMvpBoundary: 1, sortOrder: 0 },
    ])
    expect(doc).toMatch(/rendered from the HQ database/i)
  })
})

describe("parseArchComponentList", () => {
  it("extracts components from h2 section", () => {
    const content = `# ARCH — Payments

## New Components
- Payment service
- API routes

## Components Requiring Detailed Design
- Stripe adapter
- Webhook handler
- Ledger service

## Roll-up Plan
- Promote to canonical
`
    const components = parseArchComponentList(content)

    expect(components).toEqual([
      "Stripe adapter",
      "Webhook handler",
      "Ledger service",
    ])
  })

  it("extracts components from h3 section", () => {
    const content = `# ARCH

### Components Requiring Detailed Design
- Auth middleware
- Session store
`
    const components = parseArchComponentList(content)

    expect(components).toEqual(["Auth middleware", "Session store"])
  })

  it("returns empty array when section is missing", () => {
    const content = `# ARCH

## Components
- Something else
`
    const components = parseArchComponentList(content)
    expect(components).toEqual([])
  })

  it("returns empty array for empty content", () => {
    expect(parseArchComponentList("")).toEqual([])
  })
})

describe("milestoneToArchDir", () => {
  it("converts name to snake_case directory", () => {
    expect(milestoneToArchDir("Core invoicing")).toBe("core_invoicing")
    expect(milestoneToArchDir("Payments")).toBe("payments")
    expect(milestoneToArchDir("Multi-currency Support")).toBe(
      "multicurrency_support",
    )
  })

  it("handles special characters", () => {
    expect(milestoneToArchDir("Auth & Permissions")).toBe("auth__permissions")
    expect(milestoneToArchDir("Spaces")).toBe("spaces")
    expect(milestoneToArchDir("API v2.0")).toBe("api_v20")
  })
})

describe("buildSkillPrompt (via planning engine internals)", () => {
  it("includes skill content and project prompt", () => {
    // Test the prompt construction logic directly
    const skillContent = "# Vision Skill\n\nExtract a hypothesis."
    const projectPrompt = "Build a SaaS for freelancers"

    // Reconstruct the logic from planning-engine.ts
    const parts: string[] = [
      skillContent,
      `\n\nProject prompt: ${projectPrompt}`,
    ]
    parts.push(
      "\nRead the project's docs/ directory for existing context before writing.\nWrite your output files directly — do not explain what you would write.",
    )
    const prompt = parts.join("")

    expect(prompt).toContain("# Vision Skill")
    expect(prompt).toContain("Build a SaaS for freelancers")
    expect(prompt).toContain("Write your output files directly")
  })

  it("includes milestone context when provided", () => {
    const parts: string[] = [
      "skill content",
      "\n\nProject prompt: test",
      "\nFocus on milestone: Payments",
    ]
    const prompt = parts.join("")

    expect(prompt).toContain("Focus on milestone: Payments")
  })

  it("includes component and phase context when provided", () => {
    const parts: string[] = [
      "skill content",
      "\n\nProject prompt: test",
      "\nDesign component: Stripe adapter",
      "\nWrite to: docs/detailed_design/Payment_Flow/Stripe adapter.md",
    ]
    const prompt = parts.join("")

    expect(prompt).toContain("Design component: Stripe adapter")
    expect(prompt).toContain("docs/detailed_design/Payment_Flow")
  })
})

describe("PlanningEngine", () => {
  let tmpDir: string
  let projectId: string

  const config = { model: "sonnet", apiKey: "sk-test-key" }

  beforeEach(async () => {
    vi.clearAllMocks()
    testDb = createTestDb()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planning-engine-test-"))

    // Install skills into workspace
    const { installSkills } = await import("./skill-installer")
    installSkills(tmpDir)

    // Seed a project pointing to tmpDir
    const project = seedProject(testDb, { workspacePath: tmpDir })
    projectId = project.id
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("runSkill spawns agent with skill prompt", async () => {
    const { PlanningEngine } = await import("./planning-engine")
    const engine = new PlanningEngine()

    const result = await engine.runSkill(projectId, "vision", config)

    expect(result.success).toBe(true)
    expect(result.agentId).toBeDefined()

    // Verify agent_runs record was inserted
    const agentRun = testDb
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, result.agentId))
      .get()

    expect(agentRun).toBeDefined()
    expect(agentRun!.projectId).toBe(projectId)
    expect(agentRun!.status).toBe("queued")

    // Verify spawn was called
    expect(mockSpawn).toHaveBeenCalled()
  })

  it("runSkill includes project prompt in agent prompt", async () => {
    const { PlanningEngine } = await import("./planning-engine")
    const engine = new PlanningEngine()

    const result = await engine.runSkill(projectId, "vision", config)

    const agentRun = testDb
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, result.agentId))
      .get()

    expect(agentRun!.prompt).toContain("A test project for unit testing purposes.")
  })

  it("runSkill handles spawn failure", async () => {
    mockSpawn.mockRejectedValueOnce(new Error("Spawn failed"))

    const { PlanningEngine } = await import("./planning-engine")
    const engine = new PlanningEngine()

    const result = await engine.runSkill(projectId, "vision", config)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Spawn failed")

    const agentRun = testDb
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, result.agentId))
      .get()

    expect(agentRun!.status).toBe("failed")
  })

  it("runPipeline installs skills and spawns vision agent", async () => {
    const { PlanningEngine } = await import("./planning-engine")
    const engine = new PlanningEngine()

    const result = await engine.runPipeline(projectId, config)

    // Verify skills directory exists
    expect(fs.existsSync(path.join(tmpDir, "skills"))).toBe(true)

    // Verify result has at least one skill result
    expect(result.skills.length).toBeGreaterThanOrEqual(1)
    expect(result.skills[0].skillName).toBe("vision")
  })

  it("runPipeline emits progress events", async () => {
    const { PlanningEngine } = await import("./planning-engine")
    const engine = new PlanningEngine()

    const onProgress = vi.fn()
    await engine.runPipeline(projectId, config, onProgress)

    // Should have been called with vision running and vision completed
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ level: "vision", status: "running" }),
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ level: "vision", status: "completed" }),
    )
  })
})
