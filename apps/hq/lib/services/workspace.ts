import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { installSkills } from "./skill-installer"

const DEFAULT_BASE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  "auteng-projects",
)

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function generateClaudeMd(projectName: string): string {
  return `# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project

${projectName} — an AI-orchestrated project managed by AutEng HQ.

## Documentation

Read the docs in this order for full context:
1. \`docs/VISION.md\` — Product scope, users, success metrics
2. \`docs/CODING-STANDARDS.md\` — Code style and quality rules
3. \`docs/TAXONOMY.md\` — Entity names, statuses, naming conventions
4. \`docs/ARCH.md\` — System design, schema, component boundaries
5. \`docs/PLAN.md\` — Phased implementation plan

## Logs

- \`docs/PLAN_PROGRESS_LOG.md\` — Append task completions and discoveries here
- \`docs/WORKFLOW_AUDIT.md\` — Append orchestrator actions here
`
}

export interface WorkspaceResult {
  workspacePath: string
}

export async function createWorkspace(
  projectName: string,
  baseDir?: string,
): Promise<WorkspaceResult> {
  const base = baseDir || DEFAULT_BASE_DIR
  const slug = slugify(projectName)
  const workspacePath = path.join(base, slug)

  // Ensure base directory exists
  fs.mkdirSync(base, { recursive: true })

  // Ensure workspace doesn't already exist
  if (fs.existsSync(workspacePath)) {
    // Append timestamp to make unique
    const uniquePath = `${workspacePath}-${Date.now()}`
    return createWorkspaceAt(uniquePath, projectName)
  }

  return createWorkspaceAt(workspacePath, projectName)
}

async function createWorkspaceAt(
  workspacePath: string,
  projectName: string,
): Promise<WorkspaceResult> {
  // Create directory structure
  const docsDir = path.join(workspacePath, "docs")
  fs.mkdirSync(docsDir, { recursive: true })

  // Create empty append-only logs
  fs.writeFileSync(
    path.join(docsDir, "PLAN_PROGRESS_LOG.md"),
    "# Plan Progress Log\n\nAppend task completions and discoveries below.\n\n---\n",
  )
  fs.writeFileSync(
    path.join(docsDir, "WORKFLOW_AUDIT.md"),
    "# Workflow Audit Log\n\nAppend orchestrator actions below.\n\n---\n",
  )

  // Generate and write CLAUDE.md
  const claudeMd = generateClaudeMd(projectName)
  fs.writeFileSync(path.join(workspacePath, "CLAUDE.md"), claudeMd)

  // Install skills
  installSkills(workspacePath)

  // Initialize git repo and make initial commit
  const execOpts = { cwd: workspacePath, stdio: "pipe" as const }
  execSync("git init", execOpts)
  execSync("git add .", execOpts)
  execSync(
    'git commit -m "init: workspace scaffold with skills"',
    execOpts,
  )

  return { workspacePath }
}
