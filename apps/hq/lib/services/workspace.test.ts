import { describe, it, expect, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync } from "node:child_process"

vi.mock("./skill-installer", () => ({
  installSkills: vi.fn(),
}))

import { createWorkspace } from "./workspace"
import { installSkills } from "./skill-installer"

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
    const result = await createWorkspace("My Test Project", base)

    expect(result.workspacePath).toBe(path.join(base, "my-test-project"))
    expect(fs.existsSync(result.workspacePath)).toBe(true)
  })

  it("creates docs/ subdirectory with empty log files", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Log Test", base)

    const docsDir = path.join(result.workspacePath, "docs")
    expect(fs.existsSync(docsDir)).toBe(true)

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

  it("generates CLAUDE.md with project name and doc read order", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Claude MD Test", base)

    const claudeMd = fs.readFileSync(
      path.join(result.workspacePath, "CLAUDE.md"),
      "utf-8",
    )

    expect(claudeMd).toContain("Claude MD Test")
    expect(claudeMd).toContain("VISION.md")
    expect(claudeMd).toContain("CODING_STANDARDS.md")
    expect(claudeMd).toContain("ARCH.md")
  })

  it("calls installSkills with workspace path", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Skills Test", base)

    expect(installSkills).toHaveBeenCalledWith(result.workspacePath)
  })

  it("initializes a git repo with an initial commit", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Git Test", base)

    // Check .git exists
    expect(fs.existsSync(path.join(result.workspacePath, ".git"))).toBe(true)

    // Check that there's exactly one commit
    const log = execSync("git log --oneline", {
      cwd: result.workspacePath,
      encoding: "utf-8",
    })
    expect(log.trim().split("\n")).toHaveLength(1)
    expect(log).toContain("init: workspace scaffold with skills")
  })

  it("creates clean git status (no untracked or modified files)", async () => {
    const base = createTempBase()
    const result = await createWorkspace("Clean Git", base)

    const status = execSync("git status --porcelain", {
      cwd: result.workspacePath,
      encoding: "utf-8",
    })
    expect(status.trim()).toBe("")
  })

  it("slugifies project name correctly", async () => {
    const base = createTempBase()
    const result = await createWorkspace("My Cool  SaaS!! App 2.0", base)

    expect(result.workspacePath).toContain("my-cool-saas-app-2-0")
  })

  it("handles name collision by appending timestamp", async () => {
    const base = createTempBase()

    const first = await createWorkspace("Collision Test", base)
    const second = await createWorkspace("Collision Test", base)

    expect(first.workspacePath).not.toBe(second.workspacePath)
    expect(fs.existsSync(first.workspacePath)).toBe(true)
    expect(fs.existsSync(second.workspacePath)).toBe(true)
  })
})
