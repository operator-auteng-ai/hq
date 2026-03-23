import fs from "node:fs"
import path from "node:path"

const SKILL_NAMES = ["vision", "milestones", "architecture", "design"] as const

/**
 * Returns the absolute path to the skills/ source directory.
 * In dev: resolved from project root (../../skills relative to apps/hq).
 * In Electron production: process.resourcesPath + "/skills".
 */
export function getSkillsSourceDir(): string {
  const isElectronProd =
    typeof process !== "undefined" &&
    "resourcesPath" in process &&
    process.resourcesPath !== undefined

  if (isElectronProd) {
    return path.join(process.resourcesPath, "skills")
  }

  // Dev: process.cwd() is apps/hq/ — go up two levels to repo root
  return path.resolve(process.cwd(), "..", "..", "skills")
}

/**
 * Copies skill files from HQ's skills/ directory into a project workspace.
 * Idempotent — overwrites existing files.
 */
export function installSkills(workspacePath: string): void {
  const sourceDir = getSkillsSourceDir()

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Skills source directory not found: ${sourceDir}`)
  }

  for (const skillName of SKILL_NAMES) {
    const skillSourceDir = path.join(sourceDir, skillName)
    if (!fs.existsSync(skillSourceDir)) {
      throw new Error(
        `Skill source directory not found: ${skillSourceDir}`,
      )
    }

    const skillSourceFile = path.join(skillSourceDir, "SKILL.md")
    if (!fs.existsSync(skillSourceFile)) {
      throw new Error(`Skill file not found: ${skillSourceFile}`)
    }

    const targetDir = path.join(workspacePath, "skills", skillName)
    fs.mkdirSync(targetDir, { recursive: true })

    const targetFile = path.join(targetDir, "SKILL.md")
    fs.copyFileSync(skillSourceFile, targetFile)
  }
}

/**
 * Reads the SKILL.md content for a given skill from a project workspace.
 * Throws if the file is not found.
 */
export function readSkillContent(
  workspacePath: string,
  skillName: string,
): string {
  const skillFile = path.join(workspacePath, "skills", skillName, "SKILL.md")

  if (!fs.existsSync(skillFile)) {
    throw new Error(
      `Skill file not found at ${skillFile}. Run installSkills() first.`,
    )
  }

  return fs.readFileSync(skillFile, "utf-8")
}
