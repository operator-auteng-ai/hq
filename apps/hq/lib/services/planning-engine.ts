import fs from "node:fs"
import path from "node:path"
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
  async runPipeline(
    projectId: string,
    config: PlanningEngineConfig,
    onProgress?: (event: PlanningProgressEvent) => void,
  ): Promise<PlanningResult> {
    const db = getDb()
    const agentManager = getAgentManager()
    const tracker = getDeliveryTracker()
    const allSkillResults: SkillResult[] = []

    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, projectId)).get()
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!project.workspacePath) throw new Error(`Project ${projectId} has no workspace path`)

    // 1. Install skills
    installSkills(project.workspacePath)

    // 2. Vision skill
    onProgress?.({ level: "vision", status: "running" })
    const visionResult = await this.runSkill(projectId, "vision", config)
    allSkillResults.push(visionResult)
    if (!visionResult.success) {
      onProgress?.({ level: "vision", status: "failed", error: visionResult.error })
      return this.buildResult(false, allSkillResults, visionResult.error)
    }
    const visionStatus = await agentManager.waitForAgent(visionResult.agentId)
    if (visionStatus !== "completed") {
      onProgress?.({ level: "vision", status: "failed", error: `Agent ${visionStatus}` })
      return this.buildResult(false, allSkillResults, `Vision agent ${visionStatus}`)
    }
    this.extractVisionFields(projectId, project.workspacePath)
    onProgress?.({ level: "vision", status: "completed", agentId: visionResult.agentId })

    // 3. Milestones skill
    onProgress?.({ level: "milestones", status: "running" })
    const msResult = await this.runSkill(projectId, "milestones", config)
    allSkillResults.push(msResult)
    if (!msResult.success) {
      onProgress?.({ level: "milestones", status: "failed", error: msResult.error })
      return this.buildResult(false, allSkillResults, msResult.error)
    }
    const msStatus = await agentManager.waitForAgent(msResult.agentId)
    if (msStatus !== "completed") {
      onProgress?.({ level: "milestones", status: "failed" })
      return this.buildResult(false, allSkillResults, `Milestones agent ${msStatus}`)
    }
    // Parse MILESTONES.md → create milestone records
    const milestonesPath = path.join(project.workspacePath, "docs", "MILESTONES.md")
    if (!fs.existsSync(milestonesPath)) {
      onProgress?.({ level: "milestones", status: "failed", error: "MILESTONES.md not created" })
      return this.buildResult(false, allSkillResults, "Milestones agent did not create MILESTONES.md")
    }
    const milestonesContent = fs.readFileSync(milestonesPath, "utf-8")
    const parsed = parseMilestonesDoc(milestonesContent)
    const milestoneRecords = tracker.createMilestones(projectId, parsed)
    onProgress?.({ level: "milestones", status: "completed", detail: `${milestoneRecords.length} milestones` })

    // 4. For each milestone: architecture → design → task extraction
    let totalPhasesCreated = 0
    let totalTasksCreated = 0

    for (const milestone of milestoneRecords) {
      // Architecture skill
      onProgress?.({ level: "architecture", status: "running", detail: milestone.name })
      const archResult = await this.runSkill(projectId, "architecture", config, {
        milestoneName: milestone.name,
      })
      allSkillResults.push(archResult)
      if (!archResult.success) {
        onProgress?.({ level: "architecture", status: "failed", detail: milestone.name, error: archResult.error })
        continue
      }
      const archStatus = await agentManager.waitForAgent(archResult.agentId)
      if (archStatus !== "completed") {
        onProgress?.({ level: "architecture", status: "failed", detail: milestone.name })
        continue
      }
      onProgress?.({ level: "architecture", status: "completed", detail: milestone.name })

      // Parse components from arch delta
      const archDir = milestoneToArchDir(milestone.name)
      const archPath = path.join(project.workspacePath, "docs", "milestones", archDir, "ARCH.md")
      let components: string[] = []
      if (fs.existsSync(archPath)) {
        components = parseArchComponentList(fs.readFileSync(archPath, "utf-8"))
      }

      // Design skill for each component
      for (const component of components) {
        onProgress?.({ level: "design", status: "running", detail: component })
        const designResult = await this.runSkill(projectId, "design", config, {
          milestoneName: milestone.name,
          componentName: component,
        })
        allSkillResults.push(designResult)
        if (designResult.success) {
          await agentManager.waitForAgent(designResult.agentId)
        }
        onProgress?.({ level: "design", status: designResult.success ? "completed" : "failed", detail: component })
      }

      // Task extraction
      onProgress?.({ level: "task_extraction", status: "running", detail: milestone.name })
      const tasks = tracker.extractTasksFromDesignDocs(milestone.id, project.workspacePath)
      const phases = tracker.getPhases(milestone.id)
      totalPhasesCreated += phases.length
      totalTasksCreated += tasks.length
      onProgress?.({ level: "task_extraction", status: "completed", detail: `${tasks.length} tasks in ${phases.length} phases` })
    }

    // 5. Update project status
    db.update(schema.projects)
      .set({ status: "building", updatedAt: new Date().toISOString() })
      .where(eq(schema.projects.id, projectId))
      .run()

    return {
      success: true,
      skills: allSkillResults,
      milestonesCreated: milestoneRecords.length,
      phasesCreated: totalPhasesCreated,
      tasksCreated: totalTasksCreated,
    }
  }

  private extractVisionFields(projectId: string, workspacePath: string): void {
    const visionPath = path.join(workspacePath, "docs", "VISION.md")
    if (!fs.existsSync(visionPath)) return

    const content = fs.readFileSync(visionPath, "utf-8")
    const hypMatch = content.match(/## Hypothesis\s*\n+([\s\S]*?)(?=\n##|$)/)
    const hypothesis = hypMatch ? hypMatch[1].trim() : null
    const metricMatch = content.match(/## Success Metric\s*\n+([\s\S]*?)(?=\n##|$)/)
    const metric = metricMatch ? metricMatch[1].trim() : null

    if (hypothesis || metric) {
      const db = getDb()
      db.update(schema.projects)
        .set({
          visionHypothesis: hypothesis,
          successMetric: metric,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.projects.id, projectId))
        .run()
    }
  }

  private buildResult(
    success: boolean,
    skills: SkillResult[],
    error?: string,
  ): PlanningResult {
    return { success, skills, milestonesCreated: 0, phasesCreated: 0, tasksCreated: 0, error }
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
