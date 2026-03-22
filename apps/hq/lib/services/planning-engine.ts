import { v4 as uuidv4 } from "uuid"
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/lib/db"
import { getAgentManager } from "@/lib/process/agent-manager"
import { getDeliveryTracker } from "@/lib/services/delivery-tracker"
import { readSkillContent, installSkills } from "@/lib/services/skill-installer"
import { getAnthropicApiKey } from "@/lib/services/secrets"

// ── Types ──────────────────────────────────────────────────────────────

export type SkillName = "vision" | "milestones" | "architecture" | "design"

export type CollaborationProfile = "operator" | "architect" | "full_auto"

export interface PlanningEngineConfig {
  model: string
  apiKey: string
  collaborationProfile?: CollaborationProfile
  maxTurns?: number
  maxBudgetUsd?: number
}

export interface PlanningProgressEvent {
  level: SkillName | "task_extraction" | "arch_rollup"
  status: "running" | "completed" | "awaiting_review" | "failed"
  detail?: string
  agentId?: string
  error?: string
}

export interface SkillContext {
  milestoneName?: string
  componentName?: string
  phaseName?: string
}

export interface SkillResult {
  skillName: SkillName
  success: boolean
  filesCreated: string[]
  agentId: string
  error?: string
}

export interface PlanningResult {
  success: boolean
  skills: SkillResult[]
  milestonesCreated: number
  phasesCreated: number
  tasksCreated: number
  error?: string
}

export interface ParsedMilestone {
  name: string
  description: string
  isMvpBoundary: boolean
}

// ── Pure functions ─────────────────────────────────────────────────────

/**
 * Parse MILESTONES.md to extract milestone entries.
 *
 * Expected format:
 *   ### M1: Core Invoicing ← MVP
 *   Build the core invoicing module...
 *
 * "← MVP" suffix marks the MVP boundary milestone.
 * If no "← MVP" marker, the last milestone under a "## MVP Scope" section
 * is treated as the boundary.
 */
export function parseMilestonesDoc(content: string): ParsedMilestone[] {
  const lines = content.split("\n")
  const milestones: ParsedMilestone[] = []
  let inMvpSection = false
  let lastMvpSectionIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track MVP Scope section
    if (/^##\s+MVP\s+Scope/i.test(line)) {
      inMvpSection = true
      continue
    }
    // A new ## heading ends the MVP section
    if (inMvpSection && /^##\s+/.test(line) && !/^###/.test(line)) {
      inMvpSection = false
    }

    // Match milestone headings: ### M1: Name or ### M1: Name ← MVP
    const match = line.match(/^###\s+M\d+:\s*(.+?)(?:\s*←\s*MVP)?\s*$/)
    if (!match) continue

    const hasExplicitMvp = /←\s*MVP\s*$/.test(line)
    const name = match[1].trim()

    // Find next non-empty line as description
    let description = ""
    for (let j = i + 1; j < lines.length; j++) {
      const descLine = lines[j].trim()
      if (descLine.length > 0) {
        description = descLine
        break
      }
    }

    const index = milestones.length
    milestones.push({
      name,
      description,
      isMvpBoundary: hasExplicitMvp,
    })

    if (inMvpSection) {
      lastMvpSectionIndex = index
    }
  }

  // If no explicit MVP marker found, use last milestone in MVP Scope section
  const hasExplicitMvp = milestones.some((m) => m.isMvpBoundary)
  if (!hasExplicitMvp && lastMvpSectionIndex >= 0) {
    milestones[lastMvpSectionIndex].isMvpBoundary = true
  }

  return milestones
}

/**
 * Extract component names from an ARCH.md document.
 * Looks for "## Components Requiring Detailed Design" or
 * "### Components Requiring Detailed Design" and collects bullet items.
 */
export function parseArchComponentList(archContent: string): string[] {
  const lines = archContent.split("\n")
  const components: string[] = []
  let inSection = false

  for (const line of lines) {
    // Match the section heading (## or ###)
    if (/^#{2,3}\s+Components Requiring Detailed Design/i.test(line)) {
      inSection = true
      continue
    }

    // A new heading of equal or higher level ends the section
    if (inSection && /^#{1,3}\s+/.test(line) && !/^#{4,}/.test(line)) {
      // Check it's not a sub-heading of the section
      if (!/Components Requiring Detailed Design/i.test(line)) {
        break
      }
    }

    if (inSection && line.startsWith("- ")) {
      const component = line.slice(2).trim()
      if (component.length > 0) {
        components.push(component)
      }
    }
  }

  return components
}

/**
 * Convert a milestone name to a directory-safe string.
 * "Core invoicing" → "core_invoicing"
 * "Payments" → "payments"
 */
export function milestoneToArchDir(milestoneName: string): string {
  return milestoneName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

// ── Prompt builder ─────────────────────────────────────────────────────

function buildSkillPrompt(
  skillContent: string,
  projectPrompt: string,
  context?: SkillContext,
): string {
  const parts: string[] = [skillContent, `\n\nProject prompt: ${projectPrompt}`]

  if (context?.milestoneName) {
    parts.push(`\nFocus on milestone: ${context.milestoneName}`)
  }
  if (context?.componentName) {
    parts.push(`\nDesign component: ${context.componentName}`)
  }
  if (context?.phaseName && context?.componentName) {
    parts.push(
      `\nWrite to: docs/detailed_design/${context.phaseName}/${context.componentName}.md`,
    )
  }

  parts.push(
    "\nRead the project's docs/ directory for existing context before writing.\nWrite your output files directly — do not explain what you would write.",
  )

  return parts.join("")
}

// ── PlanningEngine class ───────────────────────────────────────────────

export class PlanningEngine {
  /**
   * Run the full planning pipeline for a project.
   *
   * Currently spawns the vision skill and returns immediately.
   * TODO: Sequential skill orchestration requires agent completion callbacks
   * (Phase 3.9 orchestrator rewrite). For now, only the first skill (vision)
   * is spawned. The API route should poll agent status and invoke subsequent
   * skills (milestones → architecture → design → task_extraction) as each
   * agent completes.
   */
  async runPipeline(
    projectId: string,
    config: PlanningEngineConfig,
    onProgress?: (event: PlanningProgressEvent) => void,
  ): Promise<PlanningResult> {
    const db = getDb()

    // 1. Read project from DB
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()

    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }
    if (!project.workspacePath) {
      throw new Error(`Project ${projectId} has no workspace path`)
    }

    // 2. Install skills into workspace
    installSkills(project.workspacePath)

    // 3. Spawn vision skill
    onProgress?.({
      level: "vision",
      status: "running",
      detail: "Starting vision skill agent",
    })

    const visionResult = await this.runSkill(projectId, "vision", config, {})

    onProgress?.({
      level: "vision",
      status: visionResult.success ? "completed" : "failed",
      agentId: visionResult.agentId,
      detail: visionResult.success
        ? "Vision agent spawned"
        : "Vision agent failed to start",
      error: visionResult.error,
    })

    // TODO: After vision agent completes (via callback/polling), continue with:
    // - milestones skill → parse MILESTONES.md → createMilestones()
    // - architecture skill (per milestone) → parse components
    // - design skill (per component) → extractTasksFromDesignDocs()
    // This requires agent completion callbacks not yet available.

    return {
      success: visionResult.success,
      skills: [visionResult],
      milestonesCreated: 0,
      phasesCreated: 0,
      tasksCreated: 0,
    }
  }

  /**
   * Run a single skill agent for a project.
   * Spawns the agent and returns immediately — the agent runs in the background.
   */
  async runSkill(
    projectId: string,
    skillName: SkillName,
    config: PlanningEngineConfig,
    context?: SkillContext,
  ): Promise<SkillResult> {
    const db = getDb()
    const agentManager = getAgentManager()

    // Read project
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get()

    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }
    if (!project.workspacePath) {
      throw new Error(`Project ${projectId} has no workspace path`)
    }

    // Read skill content and build prompt
    const skillContent = readSkillContent(project.workspacePath, skillName)
    const prompt = buildSkillPrompt(skillContent, project.prompt, context)

    // Generate agent ID and insert agent_runs record
    const agentId = uuidv4()

    db.insert(schema.agentRuns)
      .values({
        id: agentId,
        projectId,
        agentType: "claude_code",
        prompt,
        status: "queued",
        model: config.model,
        maxTurns: config.maxTurns ?? null,
        budgetUsd: config.maxBudgetUsd ?? null,
        phaseLabel: skillName,
      })
      .run()

    // Spawn agent (fire-and-forget — resolves when agent starts)
    try {
      await agentManager.spawn(agentId, projectId, prompt, {
        model: config.model,
        maxTurns: config.maxTurns,
        maxBudgetUsd: config.maxBudgetUsd,
        apiKey: config.apiKey,
        phaseLabel: skillName,
      })

      return {
        skillName,
        success: true,
        filesCreated: [],
        agentId,
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown spawn error"

      db.update(schema.agentRuns)
        .set({ status: "failed", completedAt: new Date().toISOString() })
        .where(eq(schema.agentRuns.id, agentId))
        .run()

      return {
        skillName,
        success: false,
        filesCreated: [],
        agentId,
        error: message,
      }
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

const PLANNING_ENGINE_KEY = Symbol.for("auteng.planningEngine")

const globalRecord = globalThis as unknown as Record<symbol, PlanningEngine>

export function getPlanningEngine(): PlanningEngine {
  if (!globalRecord[PLANNING_ENGINE_KEY]) {
    globalRecord[PLANNING_ENGINE_KEY] = new PlanningEngine()
  }
  return globalRecord[PLANNING_ENGINE_KEY]
}
