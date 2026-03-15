import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync } from "node:child_process"
import { createWorkspace } from "./workspace"
import type { GeneratedDocs } from "./doc-generator"

const TEST_DOCS: GeneratedDocs = {
  vision: "# VISION\n\nThis is the vision document.",
  arch: "# ARCH\n\n## Tech Stack\n\n| Layer | Tech |\n|-------|------|\n| Frontend | React |",
  plan: "# PLAN\n\n## Phase 0\n\nSetup phase.",
  taxonomy: "# TAXONOMY\n\nEntity definitions.",
  codingStandards: "# CODING-STANDARDS\n\nUse TypeScript strict mode.",
}

const createdDirs: string[] = []

function createTempBase(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "auteng-test-"))
  createdDirs.push(base)
  return base
}

afterEach(() => {
  for (const dir of createdDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  }
  createdDirs.length = 0
})

describe("createWorkspace", () => {
  it("creates workspace directory at the expected path", async () => {
    const base = createTempBase()
    const result = await createWorkspace("My Test Project", TEST_DOCS, base)

    expect(result.workspacePath).toBe(path.join(base, "my-test-project"))
    expect(fs.existsSync(result.workspacePath)).toBe(true)
  })

  it("writes all 5 doc files to docs/ directory", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Doc Test", TEST_DOCS, base)

    const docsDir = path.join(result.workspacePath, "docs")
    expect(fs.readFileSync(path.join(docsDir, "VISION.md"), "utf-8")).toBe(TEST_DOCS.vision)
    expect(fs.readFileSync(path.join(docsDir, "ARCH.md"), "utf-8")).toBe(TEST_DOCS.arch)
    expect(fs.readFileSync(path.join(docsDir, "PLAN.md"), "utf-8")).toBe(TEST_DOCS.plan)
    expect(fs.readFileSync(path.join(docsDir, "TAXONOMY.md"), "utf-8")).toBe(TEST_DOCS.taxonomy)
    expect(fs.readFileSync(path.join(docsDir, "CODING-STANDARDS.md"), "utf-8")).toBe(
      TEST_DOCS.codingStandards,
    )
  })

  it("creates empty append-only log files", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Log Test", TEST_DOCS, base)

    const docsDir = path.join(result.workspacePath, "docs")
    const progressLog = fs.readFileSync(
      path.join(docsDir, "PLAN_PROGRESS_LOG.md"),
      "utf-8",
    )
    const auditLog = fs.readFileSync(
      path.join(docsDir, "WORKFLOW_AUDIT.md"),
      "utf-8",
    )

    expect(progressLog).toContain("# Plan Progress Log")
    expect(auditLog).toContain("# Workflow Audit Log")
  })

  it("generates CLAUDE.md at workspace root", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Claude MD Test", TEST_DOCS, base)

    const claudeMd = fs.readFileSync(
      path.join(result.workspacePath, "CLAUDE.md"),
      "utf-8",
    )

    expect(claudeMd).toContain("Claude MD Test")
    expect(claudeMd).toContain("VISION.md")
    expect(claudeMd).toContain("CODING-STANDARDS.md")
    expect(claudeMd).toContain("Tech Stack")
  })

  it("initializes a git repo with an initial commit", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Git Test", TEST_DOCS, base)

    // Check .git exists
    expect(fs.existsSync(path.join(result.workspacePath, ".git"))).toBe(true)

    // Check that there's exactly one commit
    const log = execSync("git log --oneline", {
      cwd: result.workspacePath,
      encoding: "utf-8",
    })
    expect(log.trim().split("\n")).toHaveLength(1)
    expect(log).toContain("init: generated workflow docs")
  })

  it("creates clean git status (no untracked or modified files)", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Clean Git", TEST_DOCS, base)

    const status = execSync("git status --porcelain", {
      cwd: result.workspacePath,
      encoding: "utf-8",
    })
    expect(status.trim()).toBe("")
  })

  it("slugifies project name correctly", async () => {
    const base = createTempBase()
    const result = await createWorkspace("My Cool  SaaS!! App 2.0", TEST_DOCS, base)

    expect(result.workspacePath).toContain("my-cool-saas-app-2-0")
  })

  it("handles name collision by appending timestamp", async () => {
    const base = createTempBase()

    const first = await createWorkspace("Collision Test", TEST_DOCS, base)
    const second = await createWorkspace("Collision Test", TEST_DOCS, base)

    expect(first.workspacePath).not.toBe(second.workspacePath)
    expect(fs.existsSync(first.workspacePath)).toBe(true)
    expect(fs.existsSync(second.workspacePath)).toBe(true)
  })
})
