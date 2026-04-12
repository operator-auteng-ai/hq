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

const COLLABORATIVE_LEVELS: Record<CollaborationProfile, SkillName[]> = {
  operator: ["vision", "milestones"],
  architect: ["vision", "milestones", "architecture", "design"],
  full_auto: ["vision"],
}

export function isCollaborativeAt(
  profile: CollaborationProfile,
  level: SkillName,
): boolean {
  return COLLABORATIVE_LEVELS[profile].includes(level)
}

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
  instruction?: string
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
  awaitingReview?: SkillName
}

interface StepResult {
  success: boolean
  nextStep?: string
  error?: string
  skillResult?: SkillResult
  milestonesCreated?: number
  phasesCreated?: number
  tasksCreated?: number
}

// ── Pure functions ─────────────────────────────────────────────────────

/**
 * Render MILESTONES.md markdown from a set of milestone records.
 *
 * The file is an output-only, human-readable export of the database state.
 * Agents must never read this file back into the DB — planning items live
 * in the DB and are written through the mcp__hq__set_milestones tool.
 */
export function renderMilestonesDoc(
  projectName: string,
  milestones: Array<{
    name: string
    description: string | null
    isMvpBoundary: number
    sortOrder: number
  }>,
): string {
  const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder)
  const mvpIdx = sorted.findIndex((m) => m.isMvpBoundary === 1)
  const mvpEnd = mvpIdx >= 0 ? mvpIdx : sorted.length - 1

  const lines: string[] = []
  lines.push(`# MILESTONES — ${projectName}`)
  lines.push("")
  lines.push(
    "> This file is rendered from the HQ database. Do not edit it directly —",
  )
  lines.push(
    "> changes here will be overwritten. Edit milestones through the HQ UI",
  )
  lines.push("> or by re-running the milestones skill.")
  lines.push("")
  lines.push("## MVP Scope")
  lines.push("")

  for (let i = 0; i <= mvpEnd && i < sorted.length; i++) {
    const m = sorted[i]
    const mvpMarker = m.isMvpBoundary === 1 ? " <- MVP" : ""
    lines.push(`### M${i + 1}: ${m.name}${mvpMarker}`)
    if (m.description) lines.push(m.description)
    lines.push("")
  }

  if (mvpEnd < sorted.length - 1) {
    lines.push("---")
    lines.push("")
    lines.push("## Post-MVP")
    lines.push("")
    for (let i = mvpEnd + 1; i < sorted.length; i++) {
      const m = sorted[i]
      lines.push(`### M${i + 1}: ${m.name}`)
      if (m.description) lines.push(m.description)
      lines.push("")
    }
  }

  return lines.join("\n")
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

  if (context?.instruction) {
    parts.push(`\n\nInstruction for this run:\n${context.instruction}`)
  }

  return parts.join("")
}

// ── PlanningEngine class ───────────────────────────────────────────────

export class PlanningEngine {
  /**
   * Run the next step of the planning pipeline.
   * Reads project.planningStep to determine where to resume.
   * Runs one skill, then either pauses (awaiting_review) or continues
   * to the next step based on the collaboration profile.
   */
  async runPipeline(
    projectId: string,
    config: PlanningEngineConfig,
    onProgress?: (event: PlanningProgressEvent) => void,
  ): Promise<PlanningResult> {
    const db = getDb()
    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, projectId)).get()
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!project.workspacePath) throw new Error(`Project ${projectId} has no workspace path`)

    const profile = (config.collaborationProfile ?? project.collaborationProfile ?? "operator") as CollaborationProfile
    const step = project.planningStep ?? "init"

    // Re-install skills on every run so workspace copies stay in sync with
    // the canonical skills/ directory. installSkills is idempotent.
    installSkills(project.workspacePath)

    // Run steps until we hit a collaborative pause or complete
    let currentStep = step === "init" ? "vision" : step
    const allSkillResults: SkillResult[] = []
    let totalMilestones = 0
    let totalPhases = 0
    let totalTasks = 0

    while (currentStep !== "complete") {
      const result = await this.runStep(
        projectId, currentStep, config, project.workspacePath, onProgress,
      )

      if (result.skillResult) allSkillResults.push(result.skillResult)
      totalMilestones += result.milestonesCreated ?? 0
      totalPhases += result.phasesCreated ?? 0
      totalTasks += result.tasksCreated ?? 0

      if (!result.success) {
        return this.buildResult(false, allSkillResults, result.error)
      }

      const nextStep = result.nextStep ?? "complete"

      // Save progress
      db.update(schema.projects)
        .set({ planningStep: nextStep, updatedAt: new Date().toISOString() })
        .where(eq(schema.projects.id, projectId))
        .run()

      // Check if we should pause for review at the COMPLETED level
      const completedLevel = this.stepToSkillName(currentStep)
      if (completedLevel && isCollaborativeAt(profile, completedLevel) && nextStep !== "complete") {
        onProgress?.({
          level: completedLevel,
          status: "awaiting_review",
          detail: `Review ${completedLevel} before continuing`,
        })
        // Return with awaiting_review — caller must POST /plan/continue to resume
        return {
          success: true,
          skills: allSkillResults,
          milestonesCreated: totalMilestones,
          phasesCreated: totalPhases,
          tasksCreated: totalTasks,
          awaitingReview: completedLevel,
        }
      }

      currentStep = nextStep
    }

    // Pipeline complete
    db.update(schema.projects)
      .set({ status: "building", planningStep: "complete", updatedAt: new Date().toISOString() })
      .where(eq(schema.projects.id, projectId))
      .run()

    return {
      success: true,
      skills: allSkillResults,
      milestonesCreated: totalMilestones,
      phasesCreated: totalPhases,
      tasksCreated: totalTasks,
    }
  }

  private stepToSkillName(step: string): SkillName | null {
    if (step === "vision") return "vision"
    if (step === "milestones") return "milestones"
    if (step.startsWith("architecture:")) return "architecture"
    if (step.startsWith("design:")) return "design"
    return null
  }

  /**
   * Extract the error reason from a failed agent run's output.
   */
  private getAgentError(agentId: string): string | undefined {
    const db = getDb()
    const run = db.select({ output: schema.agentRuns.output })
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, agentId))
      .get()
    if (!run?.output) return undefined
    try {
      const messages = JSON.parse(run.output)
      // Look for result message with error
      for (const msg of messages) {
        if (msg.type === "result" && msg.is_error && msg.result) {
          return String(msg.result)
        }
      }
      // Look for error text in assistant messages
      for (const msg of messages) {
        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text" && /error|invalid|fail/i.test(block.text)) {
              return block.text
            }
          }
        }
      }
    } catch {
      // output not parseable
    }
    return undefined
  }

  private async runStep(
    projectId: string,
    step: string,
    config: PlanningEngineConfig,
    workspacePath: string,
    onProgress?: (event: PlanningProgressEvent) => void,
  ): Promise<StepResult> {
    const agentManager = getAgentManager()
    const tracker = getDeliveryTracker()
    const db = getDb()

    // ── Vision ──
    if (step === "vision") {
      onProgress?.({ level: "vision", status: "running" })
      const result = await this.runSkill(projectId, "vision", config)
      if (!result.success) {
        onProgress?.({ level: "vision", status: "failed", error: result.error })
        return { success: false, error: result.error, skillResult: result }
      }
      const status = await agentManager.waitForAgent(result.agentId)
      if (status !== "completed") {
        const reason = this.getAgentError(result.agentId) ?? `Agent ${status}`
        onProgress?.({ level: "vision", status: "failed", error: reason })
        return { success: false, error: `Vision agent ${status}: ${reason}`, skillResult: result }
      }
      this.extractVisionFields(projectId, workspacePath)
      onProgress?.({ level: "vision", status: "completed", agentId: result.agentId })
      return { success: true, nextStep: "milestones", skillResult: result }
    }

    // ── Milestones ──
    if (step === "milestones") {
      onProgress?.({ level: "milestones", status: "running" })
      const result = await this.runSkill(projectId, "milestones", config)
      if (!result.success) {
        onProgress?.({ level: "milestones", status: "failed", error: result.error })
        return { success: false, error: result.error, skillResult: result }
      }
      const status = await agentManager.waitForAgent(result.agentId)
      if (status !== "completed") {
        const reason = this.getAgentError(result.agentId) ?? `Agent ${status}`
        onProgress?.({ level: "milestones", status: "failed", error: reason })
        return { success: false, error: `Milestones agent ${status}: ${reason}`, skillResult: result }
      }

      // The agent writes milestones to the DB via mcp__hq__set_milestones.
      // Read them back and verify the skill actually persisted something.
      const records = tracker.getMilestones(projectId)
      if (records.length === 0) {
        onProgress?.({
          level: "milestones",
          status: "failed",
          error: "Milestones skill completed but no milestones were persisted. The agent may have skipped the mcp__hq__set_milestones tool call.",
        })
        return {
          success: false,
          error: "No milestones persisted",
          skillResult: result,
        }
      }

      // Render MILESTONES.md from the DB as a human-readable export
      const project = db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .get()
      if (project) {
        const docsDir = path.join(workspacePath, "docs")
        fs.mkdirSync(docsDir, { recursive: true })
        fs.writeFileSync(
          path.join(docsDir, "MILESTONES.md"),
          renderMilestonesDoc(project.name, records),
          "utf-8",
        )
      }

      onProgress?.({ level: "milestones", status: "completed", detail: `${records.length} milestones` })

      // Next step: architecture for first milestone
      return {
        success: true,
        nextStep: `architecture:${records[0].name}`,
        skillResult: result,
        milestonesCreated: records.length,
      }
    }

    // ── Architecture (per milestone) ──
    if (step.startsWith("architecture:")) {
      const milestoneName = step.slice("architecture:".length)
      onProgress?.({ level: "architecture", status: "running", detail: milestoneName })

      const result = await this.runSkill(projectId, "architecture", config, { milestoneName })
      if (!result.success) {
        onProgress?.({ level: "architecture", status: "failed", detail: milestoneName, error: result.error })
        // Skip to next milestone's architecture or design phase
        return { success: true, nextStep: this.getNextArchStep(projectId, milestoneName), skillResult: result }
      }
      const status = await agentManager.waitForAgent(result.agentId)
      if (status !== "completed") {
        const reason = this.getAgentError(result.agentId) ?? `Agent ${status}`
        onProgress?.({ level: "architecture", status: "failed", detail: milestoneName, error: reason })
        return { success: true, nextStep: this.getNextArchStep(projectId, milestoneName), skillResult: result }
      }
      onProgress?.({ level: "architecture", status: "completed", detail: milestoneName })

      // Parse components → design steps
      const archDir = milestoneToArchDir(milestoneName)
      const archPath = path.join(workspacePath, "docs", "milestones", archDir, "ARCH.md")
      let components: string[] = []
      if (fs.existsSync(archPath)) {
        components = parseArchComponentList(fs.readFileSync(archPath, "utf-8"))
      }

      if (components.length > 0) {
        return { success: true, nextStep: `design:${milestoneName}:${components[0]}`, skillResult: result }
      }

      // No components → extract tasks directly then move to next milestone
      const milestone = tracker.getMilestones(projectId).find(m => m.name === milestoneName)
      if (milestone) {
        const tasks = tracker.extractTasksFromDesignDocs(milestone.id, workspacePath)
        const phases = tracker.getPhases(milestone.id)
        return {
          success: true,
          nextStep: this.getNextArchStep(projectId, milestoneName),
          skillResult: result,
          phasesCreated: phases.length,
          tasksCreated: tasks.length,
        }
      }

      return { success: true, nextStep: this.getNextArchStep(projectId, milestoneName), skillResult: result }
    }

    // ── Design (per component) ──
    if (step.startsWith("design:")) {
      const parts = step.slice("design:".length).split(":")
      const milestoneName = parts[0]
      const componentName = parts.slice(1).join(":")

      onProgress?.({ level: "design", status: "running", detail: componentName })
      const result = await this.runSkill(projectId, "design", config, {
        milestoneName,
        componentName,
      })
      if (result.success) {
        await agentManager.waitForAgent(result.agentId)
      }
      onProgress?.({ level: "design", status: result.success ? "completed" : "failed", detail: componentName })

      // Find next component or move to task extraction
      const nextDesignStep = this.getNextDesignStep(projectId, workspacePath, milestoneName, componentName)
      if (nextDesignStep) {
        return { success: true, nextStep: nextDesignStep, skillResult: result }
      }

      // All components designed for this milestone → extract tasks
      const milestone = tracker.getMilestones(projectId).find(m => m.name === milestoneName)
      let phasesCreated = 0
      let tasksCreated = 0
      if (milestone) {
        onProgress?.({ level: "task_extraction", status: "running", detail: milestoneName })
        const tasks = tracker.extractTasksFromDesignDocs(milestone.id, workspacePath)
        const phases = tracker.getPhases(milestone.id)
        phasesCreated = phases.length
        tasksCreated = tasks.length
        onProgress?.({ level: "task_extraction", status: "completed", detail: `${tasks.length} tasks in ${phases.length} phases` })
      }

      return {
        success: true,
        nextStep: this.getNextArchStep(projectId, milestoneName),
        skillResult: result,
        phasesCreated,
        tasksCreated,
      }
    }

    return { success: true, nextStep: "complete" }
  }

  private getNextArchStep(projectId: string, currentMilestoneName: string): string {
    const tracker = getDeliveryTracker()
    const milestones = tracker.getMilestones(projectId)
    const currentIdx = milestones.findIndex(m => m.name === currentMilestoneName)
    const next = milestones[currentIdx + 1]
    if (next) return `architecture:${next.name}`
    return "complete"
  }

  private getNextDesignStep(
    projectId: string,
    workspacePath: string,
    milestoneName: string,
    currentComponent: string,
  ): string | null {
    const archDir = milestoneToArchDir(milestoneName)
    const archPath = path.join(workspacePath, "docs", "milestones", archDir, "ARCH.md")
    if (!fs.existsSync(archPath)) return null

    const components = parseArchComponentList(fs.readFileSync(archPath, "utf-8"))
    const currentIdx = components.indexOf(currentComponent)
    const next = components[currentIdx + 1]
    if (next) return `design:${milestoneName}:${next}`
    return null
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
