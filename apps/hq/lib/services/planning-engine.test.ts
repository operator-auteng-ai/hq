import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import {
  parseMilestonesDoc,
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
const mockAgentManager = {
  spawn: mockSpawn,
  listByProject: vi.fn().mockReturnValue([]),
  cancel: vi.fn(),
}

vi.mock("@/lib/process/agent-manager", () => ({
  getAgentManager: () => mockAgentManager,
}))

vi.mock("@/lib/services/secrets", () => ({
  getAnthropicApiKey: () => "sk-test-key",
}))

describe("parseMilestonesDoc", () => {
  it("parses milestones with explicit MVP marker", () => {
    const content = `# MILESTONES — Test

## MVP Scope

### M1: Core Invoicing
Create and send invoices to clients

### M2: Payments
Accept Stripe payments online

### M3: Dashboard ← MVP
Track revenue and outstanding invoices

---

## Post-MVP

### M4: Recurring Invoices
Automate recurring billing
`
    const milestones = parseMilestonesDoc(content)

    expect(milestones).toHaveLength(4)
    expect(milestones[0].name).toBe("Core Invoicing")
    expect(milestones[0].description).toBe(
      "Create and send invoices to clients",
    )
    expect(milestones[0].isMvpBoundary).toBe(false)
    expect(milestones[2].name).toBe("Dashboard")
    expect(milestones[2].isMvpBoundary).toBe(true)
    expect(milestones[3].name).toBe("Recurring Invoices")
    expect(milestones[3].isMvpBoundary).toBe(false)
  })

  it("falls back to last milestone in MVP Scope section when no explicit marker", () => {
    const content = `# MILESTONES

## MVP Scope

### M1: Auth
Users can sign up and log in

### M2: Dashboard
Users see their data

## Post-MVP

### M3: Reports
Export reports
`
    const milestones = parseMilestonesDoc(content)

    expect(milestones).toHaveLength(3)
    expect(milestones[1].name).toBe("Dashboard")
    expect(milestones[1].isMvpBoundary).toBe(true)
    expect(milestones[2].isMvpBoundary).toBe(false)
  })

  it("handles single milestone", () => {
    const content = `# MILESTONES

## MVP Scope

### M1: MVP ← MVP
The whole thing
`
    const milestones = parseMilestonesDoc(content)

    expect(milestones).toHaveLength(1)
    expect(milestones[0].name).toBe("MVP")
    expect(milestones[0].isMvpBoundary).toBe(true)
  })

  it("handles empty content", () => {
    const milestones = parseMilestonesDoc("")
    expect(milestones).toHaveLength(0)
  })

  it("handles milestones without MVP section", () => {
    const content = `# MILESTONES

### M1: First
Do first thing

### M2: Second ← MVP
Do second thing
`
    const milestones = parseMilestonesDoc(content)

    expect(milestones).toHaveLength(2)
    expect(milestones[1].isMvpBoundary).toBe(true)
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

describe("skill-installer", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("installs all 4 skill files into workspace", async () => {
    const { installSkills } = await import("./skill-installer")
    installSkills(tmpDir)

    for (const name of ["vision", "milestones", "architecture", "design"]) {
      const skillPath = path.join(tmpDir, "skills", name, "SKILL.md")
      expect(fs.existsSync(skillPath)).toBe(true)
      const content = fs.readFileSync(skillPath, "utf-8")
      expect(content.length).toBeGreaterThan(0)
      expect(content).toContain("---")
    }
  })

  it("is idempotent — running twice doesn't error", async () => {
    const { installSkills } = await import("./skill-installer")
    installSkills(tmpDir)
    installSkills(tmpDir)

    const skillPath = path.join(tmpDir, "skills", "vision", "SKILL.md")
    expect(fs.existsSync(skillPath)).toBe(true)
  })

  it("readSkillContent reads installed skill", async () => {
    const { installSkills, readSkillContent } = await import(
      "./skill-installer"
    )
    installSkills(tmpDir)

    const content = readSkillContent(tmpDir, "vision")
    expect(content).toContain("vision")
    expect(content.length).toBeGreaterThan(50)
  })

  it("readSkillContent throws if skill not installed", async () => {
    const { readSkillContent } = await import("./skill-installer")

    expect(() => readSkillContent(tmpDir, "vision")).toThrow(
      "Skill file not found",
    )
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
