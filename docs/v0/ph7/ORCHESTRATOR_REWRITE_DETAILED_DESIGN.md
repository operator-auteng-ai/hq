# Phase 7 — Orchestrator Rewrite (Detailed Design)

## Problem

The orchestrator is currently a stub — all methods throw `"Use delivery tracker and milestones API"`. The milestones API route contains raw delivery tracker calls with inline business logic (cascading status updates, finding next phases). The planning engine handles skill orchestration but not task execution. There's no single component that:

- Assigns agents to individual tasks with proper context
- Detects phase completion and triggers review
- Detects milestone completion and triggers arch roll-up
- Respects collaboration profiles
- Provides a single entry point for the milestones API to delegate to

## Solution

Rewrite the orchestrator as the single coordinator for the delivery lifecycle. It owns the logic that sits between the API routes and the delivery tracker / agent manager. The delivery tracker remains the state machine (valid transitions, cascade checks). The orchestrator adds the business logic layer: prompt construction, agent spawning, review triggering, roll-up triggering, and collaboration pauses.

```
API Route → Orchestrator → DeliveryTracker (state machine)
                        → AgentManager (agent spawning)
                        → PlanningEngine (skill re-runs)
```

## New Orchestrator Interface

### File: `lib/services/orchestrator.ts`

```typescript
export class Orchestrator {
  // ── Task execution ──

  /** Start a task: build prompt, spawn agent, update statuses */
  async startTask(taskId: string): Promise<{ agentId: string }>

  /** Handle agent completion callback — update task, check phase cascade */
  async onAgentCompleted(agentId: string, status: AgentRunStatus): Promise<void>

  // ── Phase management ──

  /** Start all pending tasks in a phase sequentially (starts first one) */
  async startPhase(phaseId: string): Promise<{ agentId: string }>

  /** Approve a phase (from reviewing or review_failed) */
  async approvePhase(phaseId: string): Promise<{ nextPhaseId?: string }>

  /** Reject a phase — reset tasks, re-enter active */
  async rejectPhase(phaseId: string): Promise<void>

  /** Skip a phase — mark all pending tasks as skipped */
  async skipPhase(phaseId: string): Promise<{ nextPhaseId?: string }>

  // ── Milestone management ──

  /** Approve a milestone */
  async approveMilestone(milestoneId: string): Promise<{ nextMilestoneId?: string }>

  // ── Internal ──

  /** Build a task-level prompt with full context */
  private buildTaskPrompt(task, phase, milestone, project): string

  /** Trigger phase review after all tasks complete */
  private async triggerPhaseReview(phaseId: string): Promise<void>

  /** Trigger arch roll-up after milestone completes */
  private async triggerArchRollup(milestoneId: string): Promise<void>

  /** Get project config (model, turns, budget) */
  private async getProjectConfig(projectId: string): Promise<AgentConfig>
}
```

## Task 7.1 — Core Orchestrator Rewrite

Replace the stub methods with real implementations that use the delivery tracker.

### `startTask(taskId)`

```
1. Load task from DB (with phase → milestone → project joins)
2. Validate task is pending or failed (retryable)
3. Update task → in_progress via tracker
4. Activate phase if pending
5. Activate milestone if pending
6. Update project status → building
7. Build task prompt (see 7.2)
8. Get project config + API key
9. Insert agent_runs record (with task_id FK)
10. Spawn agent via AgentManager
11. Register onComplete callback → onAgentCompleted()
12. Return { agentId }
```

### `onAgentCompleted(agentId, status)`

Called by the agent completion callback registered in `startTask`.

```
1. Load agent_runs record to get task_id
2. If no task_id → return (ad-hoc/planning agent, not our concern)
3. If status === "completed" → tracker.updateTaskStatus(taskId, "completed")
4. If status === "failed" → tracker.updateTaskStatus(taskId, "failed")
5. If status === "cancelled" → leave task as in_progress (user can retry)
6. Check if phase needs review: tracker.checkPhaseCompletion(phaseId)
   → returns true if phase transitioned to "reviewing"
7. If phase → reviewing → triggerPhaseReview(phaseId)
8. If phase still active and there's a next pending task → startTask(nextTaskId)
   (auto-advance to next task in the phase)
```

### `startPhase(phaseId)`

```
1. Get first pending task in phase via tracker.getNextPendingTask(phaseId)
2. If no pending tasks → error
3. Activate phase if pending
4. Activate milestone if pending
5. startTask(firstTask.id) — starts the chain, onAgentCompleted auto-advances
6. Return { agentId }
```

### `approvePhase(phaseId)`

```
1. Load phase from DB
2. Validate status is reviewing or review_failed
3. Force-complete: tracker.updatePhaseStatus → completed (use DB directly since
   review_failed → completed is allowed in the transition map)
4. tracker.checkMilestoneCompletion(milestoneId)
5. Find next phase in milestone
6. Return { nextPhaseId }
```

### `rejectPhase(phaseId)`

```
1. tracker.resetPhaseForRework(phaseId) — resets tasks to pending, phase to active
```

### `skipPhase(phaseId)`

```
1. Get all pending/failed tasks in phase
2. Update each to skipped via tracker
3. Phase will cascade to reviewing (all tasks done)
4. Force-approve the phase
5. Find next phase
6. Return { nextPhaseId }
```

### `approveMilestone(milestoneId)`

```
1. Load milestone, validate status is active or completed
2. If active → tracker.updateMilestoneStatus → completed
3. triggerArchRollup(milestoneId)
4. Find next milestone in project
5. Return { nextMilestoneId }
```

## Task 7.2 — Task-Level Prompts

The orchestrator builds prompts scoped to individual tasks, not phases. The prompt gives the agent:

1. Project context (name, original prompt)
2. Milestone context (what the user can do after this milestone)
3. Phase context (what this phase accomplishes)
4. Task specifics (title, description)
5. Source design doc reference (if the task has one)
6. Standard instructions

```typescript
private buildTaskPrompt(
  task: TaskRecord,
  phase: PhaseRecord,
  milestone: MilestoneRecord,
  project: { name: string; prompt: string },
): string {
  const parts = [
    `You are working on project "${project.name}".`,
    `Original project prompt: ${project.prompt}`,
    "",
    `Milestone: ${milestone.name}`,
    milestone.description ? `  ${milestone.description}` : "",
    `Phase: ${phase.name}`,
    phase.description ? `  ${phase.description}` : "",
    "",
    `Task: ${task.title}`,
    task.description ? task.description : "",
  ]

  if (task.sourceDoc) {
    parts.push("", `Read ${task.sourceDoc} for the detailed design.`)
  }

  parts.push(
    "",
    "Read the project's docs/ directory for full context if needed.",
    "Implement this task. When done, commit your changes.",
  )

  return parts.filter(Boolean).join("\n")
}
```

## Task 7.3 — Phase Review Triggering

When `checkPhaseCompletion` returns true (all tasks done, phase → reviewing), the orchestrator spawns a review agent.

```typescript
private async triggerPhaseReview(phaseId: string): Promise<void> {
  const db = getDb()
  const phase = db.select().from(schema.phases)
    .where(eq(schema.phases.id, phaseId)).get()
  if (!phase) return

  const milestone = db.select().from(schema.milestones)
    .where(eq(schema.milestones.id, phase.milestoneId)).get()
  if (!milestone) return

  const project = db.select().from(schema.projects)
    .where(eq(schema.projects.id, milestone.projectId)).get()
  if (!project?.workspacePath) return

  // Build review prompt
  const exitCriteria = phase.exitCriteria
    ? JSON.parse(phase.exitCriteria) as string[]
    : ["Tests pass", "No lint errors", "Code compiles"]

  const prompt = [
    `You are reviewing phase "${phase.name}" of milestone "${milestone.name}" in project "${project.name}".`,
    "",
    "Check each of the following exit criteria and report pass/fail with evidence:",
    ...exitCriteria.map((c, i) => `${i + 1}. ${c}`),
    "",
    "Run the project's test suite if a test command exists (check package.json scripts).",
    "Review the code changes for quality and consistency.",
    "",
    "Output your review as JSON in a code fence:",
    "```json",
    '{ "criteria": [{ "criterion": "...", "passed": true/false, "evidence": "...", "suggestedFix": "..." }], "testsRan": true/false, "testsPassed": 0, "testsFailed": 0, "overallPass": true/false }',
    "```",
  ].join("\n")

  const config = await this.getProjectConfig(milestone.projectId)
  const apiKey = getAnthropicApiKey()
  if (!apiKey) return

  const agentId = crypto.randomUUID()
  db.insert(schema.agentRuns).values({
    id: agentId,
    projectId: milestone.projectId,
    agentType: "claude_code",
    prompt,
    status: "queued",
    model: config.model,
    phaseLabel: `review:${phase.name}`,
  }).run()

  const agentManager = getAgentManager()
  await agentManager.spawn(agentId, milestone.projectId, prompt, {
    ...config,
    apiKey,
  })

  // On review completion, parse result and update phase
  agentManager.onComplete(agentId, async (_id, status) => {
    if (status !== "completed") {
      // Review agent failed — leave phase in reviewing, user can force-approve
      return
    }

    // Parse review result from agent output
    const run = db.select().from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, agentId)).get()
    if (!run?.output) return

    const tracker = getDeliveryTracker()
    try {
      const outputStr = typeof run.output === "string" ? run.output : JSON.stringify(run.output)
      const jsonMatch = outputStr.match(/```json\s*([\s\S]*?)\s*```/)
      if (!jsonMatch) return

      const result = JSON.parse(jsonMatch[1]) as PhaseReviewResult
      result.timestamp = new Date().toISOString()
      tracker.setPhaseReviewResult(phaseId, result)

      if (result.overallPass) {
        // Review passed — complete the phase
        tracker.updatePhaseStatus(phaseId, "completed")
        tracker.checkMilestoneCompletion(phase.milestoneId)
      } else {
        // Review failed — create fix-up tasks
        tracker.updatePhaseStatus(phaseId, "review_failed")
        const failedCriteria = result.criteria
          .filter(c => !c.passed)
          .map(c => ({ criterion: c.criterion, suggestedFix: c.suggestedFix }))
        if (failedCriteria.length > 0) {
          tracker.createFixUpTasks(phaseId, failedCriteria)
        }
      }
    } catch {
      // Failed to parse review — leave in reviewing state for user to handle
    }
  })
}
```

## Task 7.4 — Arch Roll-up Triggering

When a milestone completes, the orchestrator triggers the architecture skill in roll-up mode.

```typescript
private async triggerArchRollup(milestoneId: string): Promise<void> {
  const db = getDb()
  const milestone = db.select().from(schema.milestones)
    .where(eq(schema.milestones.id, milestoneId)).get()
  if (!milestone) return

  const project = db.select().from(schema.projects)
    .where(eq(schema.projects.id, milestone.projectId)).get()
  if (!project?.workspacePath) return

  const archDir = milestoneToArchDir(milestone.name)
  const deltaPath = path.join(project.workspacePath, "docs", "milestones", archDir, "ARCH.md")

  // Only roll up if a milestone arch delta exists
  if (!fs.existsSync(deltaPath)) return

  const engine = getPlanningEngine()
  const config = await this.getProjectConfig(milestone.projectId)
  const apiKey = getAnthropicApiKey()
  if (!apiKey) return

  await engine.runSkill(milestone.projectId, "architecture", {
    model: config.model ?? "sonnet",
    apiKey,
  }, {
    milestoneName: `rollup:${milestone.name}`,
  })
}
```

The architecture skill detects the `rollup:` prefix in the milestone name and switches to roll-up mode (already specified in the skill's "Canonical Roll-up Mode" section).

## Task 7.5 — Collaboration Profile Integration

The collaboration profile is stored per-project. For this phase, we add it to the projects table and check it at key orchestrator decision points.

### Schema addition

```typescript
// Add to projects table:
collaborationProfile: text("collaboration_profile").default("operator"),
```

### Orchestrator checks

The orchestrator checks the profile at these points:
- After planning engine completes each skill → should it pause? (This is already handled by the planning engine's `onProgress` events)
- After phase review completes → auto-approve or wait? If `full_auto`, auto-approve passing reviews
- After milestone completes → auto-proceed or wait?

For this phase, implement the delivery-side checks:

```typescript
private shouldAutoApprovePhase(project: ProjectRecord): boolean {
  const profile = project.collaborationProfile ?? "operator"
  // All profiles auto-approve delivery (phase completion after review passes)
  // Only "reviewing" → "completed" when review passes is automatic
  // User can always force-approve from reviewing or review_failed
  return true // Phase auto-approval is always on when review passes
}

private shouldAutoStartNextMilestone(project: ProjectRecord): boolean {
  const profile = project.collaborationProfile ?? "operator"
  return profile === "full_auto"
}
```

## Task 7.6 — API Route Delegation

### File: `app/api/projects/[id]/milestones/route.ts`

The PATCH handler currently has inline business logic. Refactor to delegate all actions to the orchestrator:

```typescript
case "startTask":
  return NextResponse.json(await orchestrator.startTask(parsed.taskId))

case "startPhase":
  return NextResponse.json(await orchestrator.startPhase(parsed.phaseId))

case "approvePhase":
  return NextResponse.json(await orchestrator.approvePhase(parsed.phaseId))

case "rejectPhase": {
  await orchestrator.rejectPhase(parsed.phaseId)
  return NextResponse.json({ phaseId: parsed.phaseId, status: "active" })
}

case "skipTask": {
  const tracker = getDeliveryTracker()
  const task = tracker.updateTaskStatus(parsed.taskId, "skipped")
  return NextResponse.json({ taskId: task.id, status: task.status })
}

case "retryTask":
  return NextResponse.json(await orchestrator.startTask(parsed.taskId))

case "approveMilestone":
  return NextResponse.json(await orchestrator.approveMilestone(parsed.milestoneId))
```

Note: `retryTask` and `startTask` use the same orchestrator method — `startTask` handles both pending and failed tasks.

## Task 7.7 — Agent Completion Registration

The orchestrator needs to register its `onAgentCompleted` callback for every task-related agent it spawns. This is done inside `startTask`:

```typescript
agentManager.onComplete(agentId, (id, status) => {
  this.onAgentCompleted(id, status).catch((err) => {
    console.error(`Orchestrator completion handler error for agent ${id}:`, err)
  })
})
```

The auto-advance pattern (start next task when current completes) happens inside `onAgentCompleted`. This creates a chain: task 1 completes → onAgentCompleted starts task 2 → task 2 completes → onAgentCompleted starts task 3 → ... → all tasks done → phase → reviewing → review agent spawned.

## Files to Create / Modify

### Modified Files

| File | Change |
|------|--------|
| `lib/services/orchestrator.ts` | Full rewrite: task-level execution, phase review, arch roll-up, collaboration profiles |
| `lib/services/orchestrator.test.ts` | New tests for all orchestrator methods |
| `lib/db/schema.ts` | Add `collaborationProfile` to projects table |
| `app/api/projects/[id]/milestones/route.ts` | Delegate all actions to orchestrator |

### Not Modified

| File | Why |
|------|-----|
| `lib/services/delivery-tracker.ts` | Orchestrator uses it, doesn't change it |
| `lib/process/agent-manager.ts` | Completion callbacks already added in Phase 6 |
| `lib/services/planning-engine.ts` | Skill execution unchanged |

## Migration

Add `collaboration_profile` column to `projects` table (text, default "operator"). Run `drizzle-kit generate`.

## Test Plan

| Test | What it verifies |
|------|-----------------|
| **startTask — pending task** | Task → in_progress, phase → active, milestone → active, agent spawned with task_id |
| **startTask — failed task (retry)** | Failed task → in_progress, agent spawned |
| **startTask — prompt includes context** | Prompt contains milestone name, phase name, task title, source doc |
| **onAgentCompleted — success** | Task → completed, checks phase cascade |
| **onAgentCompleted — auto-advance** | After task completes, next pending task in phase starts automatically |
| **onAgentCompleted — phase reviewing** | All tasks done → phase → reviewing, review agent triggered |
| **startPhase** | Activates phase and milestone, starts first pending task |
| **approvePhase** | Phase → completed, finds next phase |
| **rejectPhase** | Tasks reset to pending, phase → active |
| **skipPhase** | All tasks → skipped, phase → completed |
| **approveMilestone** | Milestone → completed, triggers arch roll-up |
| **API delegation** | PATCH milestones actions delegate to orchestrator methods |

## Smoke Test

1. Create a project, run planning pipeline to populate milestones/tasks
2. Call PATCH milestones `{ action: "startPhase", phaseId }` — verify first task agent spawns
3. Simulate agent completion — verify next task auto-starts
4. Simulate all tasks completing — verify phase transitions to reviewing
5. Verify review agent spawns and processes exit criteria
6. If review passes — phase auto-completes
7. If review fails — fix-up tasks created, phase goes to review_failed
8. Approve milestone — verify arch roll-up triggers
9. Verify next milestone identified
