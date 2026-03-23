import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { installSkills, readSkillContent, getSkillsSourceDir } from "./skill-installer"

describe("skill-installer", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("getSkillsSourceDir resolves to a path containing 'skills'", () => {
    const dir = getSkillsSourceDir()
    expect(dir).toContain("skills")
  })

  it("installs all 4 skill files into workspace", () => {
    // Skip if skills dir doesn't exist (running from wrong cwd)
    const sourceDir = getSkillsSourceDir()
    if (!fs.existsSync(sourceDir)) return

    installSkills(tmpDir)

    for (const name of ["vision", "milestones", "architecture", "design"]) {
      const skillPath = path.join(tmpDir, "skills", name, "SKILL.md")
      expect(fs.existsSync(skillPath)).toBe(true)
      const content = fs.readFileSync(skillPath, "utf-8")
      expect(content.length).toBeGreaterThan(0)
      expect(content).toContain("---")
    }
  })

  it("is idempotent — running twice doesn't error", () => {
    const sourceDir = getSkillsSourceDir()
    if (!fs.existsSync(sourceDir)) return

    installSkills(tmpDir)
    installSkills(tmpDir)

    const skillPath = path.join(tmpDir, "skills", "vision", "SKILL.md")
    expect(fs.existsSync(skillPath)).toBe(true)
  })

  it("readSkillContent reads installed skill", () => {
    const sourceDir = getSkillsSourceDir()
    if (!fs.existsSync(sourceDir)) return

    installSkills(tmpDir)

    const content = readSkillContent(tmpDir, "vision")
    expect(content).toContain("vision")
    expect(content.length).toBeGreaterThan(50)
  })

  it("readSkillContent throws if skill not installed", () => {
    expect(() => readSkillContent(tmpDir, "vision")).toThrow(
      "Skill file not found",
    )
  })
})
