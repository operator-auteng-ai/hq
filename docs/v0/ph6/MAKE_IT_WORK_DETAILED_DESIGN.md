# Phase 6 — Make It Work (Detailed Design)

## Problem

All the components exist (skills, delivery tracker, planning engine, orchestrator chat, agent execution) but they don't connect into a working pipeline. Specifically:

1. **No completion callbacks**: `AgentManager.spawn()` is fire-and-forget. The planning engine spawns the vision skill agent and returns immediately — it can't wait for it to finish, parse the output, and spawn the next skill.

2. **Project creation is broken**: The project form calls `/plan` which only spawns the vision skill. The old `/generate` endpoint (which produced all 5 docs in one shot) is no longer called but still exists as dead code.

3. **Workspace creation assumes old flow**: `createWorkspace()` expects a `GeneratedDocs` object with all 5 docs. The new flow doesn't have docs at workspace creation time — skills produce them incrementally.

4. **Project detail page shows old data**: The phases tab reads `PLAN.md` via the phase parser. In the new flow, phases come from the delivery tracker DB, not markdown files.

5. **Agent spawn errors are swallowed**: If `spawn()` fails after the `agent_runs` DB record is created, the agent shows as "queued" forever. The error is only logged to server console.

6. **Resume doesn't set API key**: `AgentManager.resume()` doesn't retrieve the API key, so resumed agents fail silently.

## Solution

Wire the pieces together. Add completion callbacks, implement full pipeline chaining, remove old dead code, fix error handling.

## Task 6.1 — Agent Completion Callbacks

### File: `lib/process/agent-manager.ts`

Add a callback registry to `AgentManager`. When `finishAgent()` is called (on agent completion, failure, or cancellation), it invokes registered callbacks.

```typescript
// Add to AgentManager class:

private completionCallbacks = new Map<string, Array<(agentId: string, status: AgentRunStatus) => void>>()

/**
 * Register a callback to be called when a specific agent completes.
 * Multiple callbacks can be registered per agent.
 */
onComplete(
  agentId: string,
  callback: (agentId: string, status: AgentRunStatus) => void,
): void {
  const callbacks = this.completionCallbacks.get(agentId) ?? []
  callbacks.push(callback)
  this.completionCallbacks.set(agentId, callbacks)
}
```

Modify `finishAgent()` to invoke callbacks after updating DB and closing SSE:

```typescript
private finishAgent(
  agentId: string,
  status: AgentRunStatus,
  sessionId?: string,
  turnCount?: number,
): void {
  // ... existing DB update, SSE close, registry unregister ...

  // Invoke completion callbacks
  const callbacks = this.completionCallbacks.get(agentId)
  if (callbacks) {
    for (const cb of callbacks) {
      try {
        cb(agentId, status)
      } catch (err) {
        console.error(`Agent ${agentId} completion callback error:`, err)
      }
    }
    this.completionCallbacks.delete(agentId)
  }
}
```

### Helper: `waitForAgent`

Add a convenience method that returns a Promise resolving when the agent finishes:

```typescript
/**
 * Returns a Promise that resolves when the agent completes.
 * Resolves with the final status.
 */
waitForAgent(agentId: string): Promise<AgentRunStatus> {
  // If agent is already done, resolve immediately
  if (!this.agents.has(agentId)) {
    const db = getDb()
    const run = db.select().from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, agentId)).get()
    if (run && run.status !== "queued" && run.status !== "running") {
      return Promise.resolve(run.status as AgentRunStatus)
    }
  }

  return new Promise((resolve) => {
    this.onComplete(agentId, (_id, status) => resolve(status))
  })
}
```

## Task 6.2 — Full Pipeline Chaining

### File: `lib/services/planning-engine.ts`

Rewrite `runPipeline()` to use `waitForAgent()` for sequential execution. The pipeline runs entirely within the SSE stream handler — the route keeps the connection open while skills execute one by one.

```typescript
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
  // Extract hypothesis + success_metric from VISION.md, update project record
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
  const milestonesContent = fs.readFileSync(
    path.join(project.workspacePath, "docs", "MILESTONES.md"), "utf-8"
  )
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
      continue // Skip this milestone, try next
    }
    const archStatus = await agentManager.waitForAgent(archResult.agentId)
    if (archStatus !== "completed") {
      onProgress?.({ level: "architecture", status: "failed", detail: milestone.name })
      continue
    }
    onProgress?.({ level: "architecture", status: "completed", detail: milestone.name })

    // Parse "Components Requiring Detailed Design" from arch delta
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
```

### New method: `extractVisionFields`

```typescript
private extractVisionFields(projectId: string, workspacePath: string): void {
  const visionPath = path.join(workspacePath, "docs", "VISION.md")
  if (!fs.existsSync(visionPath)) return

  const content = fs.readFileSync(visionPath, "utf-8")

  // Extract hypothesis: line(s) after "## Hypothesis"
  const hypMatch = content.match(/## Hypothesis\s*\n+([\s\S]*?)(?=\n##|$)/)
  const hypothesis = hypMatch ? hypMatch[1].trim() : null

  // Extract success metric: line(s) after "## Success Metric"
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
```

### New helper: `buildResult`

```typescript
private buildResult(
  success: boolean,
  skills: SkillResult[],
  error?: string,
): PlanningResult {
  return {
    success,
    skills,
    milestonesCreated: 0,
    phasesCreated: 0,
    tasksCreated: 0,
    error,
  }
}
```

## Task 6.3 — Remove Old Doc Generator

### Delete files:
- `lib/services/doc-generator.ts`
- `lib/services/doc-generator.test.ts`
- `app/api/projects/[id]/generate/route.ts`

### Update files:
- `lib/services/workspace.ts` — remove import of `GeneratedDocs` (see Task 6.5)
- `lib/services/workspace.test.ts` — update to match new workspace creation signature

## Task 6.4 — Remove Old Phase Parser

### Delete files:
- `lib/services/phase-parser.ts`
- `lib/services/phase-parser.test.ts`

### Update files:
- `lib/services/orchestrator.ts` — remove import of `parsePhasesFromPlan`, remove `getPhases()`, `getPhase()` methods, remove `buildPhasePrompt()` that reads PLAN.md. The orchestrator will be fully rewritten in Phase 7 — for now, stub it to throw "Use delivery tracker" for methods that used phase parsing.
- `app/api/projects/[id]/phases/route.ts` — GET handler: return milestones from delivery tracker instead of parsing PLAN.md. PATCH handler: delegate to milestones route for new projects, keep basic support for legacy projects that have no milestones in DB.

## Task 6.5 — Workspace Creation Update

### File: `lib/services/workspace.ts`

The workspace no longer needs pre-generated docs. It just creates the directory structure and initializes git. Skills and the planning engine populate docs after workspace creation.

```typescript
export interface WorkspaceResult {
  workspacePath: string
}

export async function createWorkspace(
  projectName: string,
  baseDir?: string,
): Promise<WorkspaceResult> {
  // 1. Create directory at ~/auteng-projects/<slug>/
  // 2. Create docs/ subdirectory
  // 3. Create empty append-only logs (PLAN_PROGRESS_LOG.md, WORKFLOW_AUDIT.md)
  // 4. Generate minimal CLAUDE.md stub (project name, doc read order)
  // 5. Install skills via installSkills()
  // 6. git init && git add . && git commit -m "init: workspace created"
  // 7. Return { workspacePath }
}
```

Remove the `GeneratedDocs` parameter and the code that writes 5 doc files. The `generateClaudeMd()` function simplifies to a stub that doesn't reference doc content (since the docs don't exist yet).

### File: `app/api/projects/route.ts` (POST handler)

Update the project creation flow. Currently the POST creates a project record and returns the ID. The form then calls `/plan`. The issue is that `/plan` expects a workspace to already exist.

New flow:
1. POST `/api/projects` creates the project record AND the workspace (call `createWorkspace()`)
2. Return `{ id, workspacePath }`
3. Form then calls `/plan` which finds the workspace and runs skills

This eliminates the gap between "project created" and "workspace ready."

## Task 6.6 — Project Detail Page Update

### File: `app/projects/[id]/page.tsx`

Major changes:

1. **Remove phases tab that reads PLAN.md**: The `loadPhases()` function currently calls `GET /api/projects/:id/phases` which parses PLAN.md. Replace with a milestones view that calls `GET /api/projects/:id/milestones`.

2. **Show planning progress when status is `planning`**: When `project.status === "planning"`, show a simple progress indicator (which skills have run, which are pending). Poll agent_runs for the project to see which skill agents are running/completed.

3. **Show milestone tree when status is `building`**: When `project.status === "building"`, show the milestone/phase/task tree from the delivery tracker. This replaces the old phases tab.

4. **Remove "Generate Docs" button**: The old handleGenerate function calls `/generate`. Remove it. The planning pipeline is triggered from the project form, not the detail page.

5. **Keep docs tab**: The docs tab reads files from the workspace via `/api/projects/:id/docs`. This still works — the planning engine writes docs to the workspace incrementally.

## Task 6.7 — Agent Spawn Error Visibility

### File: `lib/process/agent-manager.ts`

In `spawn()`, the `consumeStream()` call is fire-and-forget with `.catch()` that only logs. If `query()` itself throws (e.g., invalid API key), the agent stays in "running" forever.

Fix: wrap the SDK `query()` call in a try/catch. If it throws, call `finishAgent(agentId, "failed")` immediately.

```typescript
// In spawn(), replace:
this.consumeStream(agentId, agentQuery).catch((err) => {
  console.error(`Agent ${agentId} stream error:`, err)
})

// With:
this.consumeStream(agentId, agentQuery).catch((err) => {
  console.error(`Agent ${agentId} stream error:`, err)
  this.finishAgent(agentId, "failed", undefined, 0)
})
```

Also, wrap the `query()` call itself:

```typescript
let agentQuery: AsyncGenerator<SDKMessage, void>
try {
  agentQuery = query({ prompt, options: { ... } })
} catch (err) {
  this.finishAgent(agentId, "failed")
  throw err
}

this.consumeStream(agentId, agentQuery).catch((err) => {
  console.error(`Agent ${agentId} stream error:`, err)
  this.finishAgent(agentId, "failed", undefined, 0)
})
```

## Task 6.8 — Resume API Key Fix

### File: `lib/process/agent-manager.ts`

In `resume()`, add API key retrieval before calling `query()`:

```typescript
// Before the query() call in resume():
const apiKey = getAnthropicApiKey()
if (apiKey) {
  process.env.ANTHROPIC_API_KEY = apiKey
}
```

Import `getAnthropicApiKey` from `@/lib/services/secrets` at the top of the file.

## Files to Create / Modify

### Delete

| File | Reason |
|------|--------|
| `lib/services/doc-generator.ts` | Replaced by planning engine + skills |
| `lib/services/doc-generator.test.ts` | Tests for deleted code |
| `lib/services/phase-parser.ts` | Replaced by delivery tracker DB |
| `lib/services/phase-parser.test.ts` | Tests for deleted code |
| `app/api/projects/[id]/generate/route.ts` | Replaced by `/plan` route |

### Modify

| File | Change |
|------|--------|
| `lib/process/agent-manager.ts` | Add `onComplete()`, `waitForAgent()` callback methods. Fix error handling in `spawn()`. Fix API key in `resume()` |
| `lib/services/planning-engine.ts` | Rewrite `runPipeline()` to chain all skills using `waitForAgent()`. Add `extractVisionFields()`, `buildResult()` helpers |
| `lib/services/workspace.ts` | Remove `GeneratedDocs` parameter. Simplify to create directory + git init + install skills. No pre-written docs |
| `lib/services/workspace.test.ts` | Update to match new workspace creation signature |
| `app/api/projects/route.ts` | POST handler creates workspace during project creation |
| `app/api/projects/[id]/phases/route.ts` | GET: return milestones from delivery tracker. PATCH: delegate to milestones route |
| `app/projects/[id]/page.tsx` | Remove old phases tab, add milestone tree view, remove "Generate Docs" button, show planning progress |
| `lib/services/orchestrator.ts` | Remove phase-parser imports and PLAN.md reading methods. Stub methods to use delivery tracker |
| `lib/services/orchestrator.test.ts` | Update tests to match stubbed orchestrator |

## Test Plan

| Test | What it verifies |
|------|-----------------|
| **AgentManager.onComplete** | Callback invoked when agent finishes with correct status |
| **AgentManager.waitForAgent** | Promise resolves with agent status on completion |
| **AgentManager.waitForAgent already done** | Resolves immediately for finished agents |
| **AgentManager spawn error** | Failed query() calls finishAgent("failed"), callback fires |
| **PlanningEngine.runPipeline chains skills** | Vision → wait → milestones → wait → architecture → design → task extraction (with mocked agents that "complete" immediately) |
| **PlanningEngine.runPipeline creates milestones** | After pipeline, milestone records exist in DB |
| **PlanningEngine.runPipeline extracts vision fields** | project.vision_hypothesis and success_metric populated |
| **PlanningEngine.runPipeline handles failure** | If vision agent fails, pipeline stops and returns error |
| **PlanningEngine.runPipeline emits all progress events** | Progress callback receives events for each stage |
| **createWorkspace (new signature)** | Creates directory, git init, installs skills, no docs written |
| **Project creation creates workspace** | POST /api/projects returns workspacePath |
| **Phases route returns milestones** | GET /phases returns delivery tracker data |
| **Resume sets API key** | resume() retrieves and sets ANTHROPIC_API_KEY |

## Smoke Test

1. Start the app. Navigate to Settings, verify API key is configured
2. Create a new project with prompt: "A simple todo app with user accounts"
3. Observe the project form — should show "Planning..." with skill progress
4. Wait for vision skill to complete (agent runs in background, SSE streams progress)
5. Wait for milestones skill to complete — should show "X milestones" in progress
6. Wait for architecture + design skills per milestone
7. Verify redirect to project detail page
8. Verify milestones tab shows milestone/phase/task tree from DB
9. Verify docs tab shows VISION.md, MILESTONES.md, and ARCH docs written by skills
10. Click "Start" on a task — verify agent spawns
11. Check agents tab — verify agent output streams
12. If agent fails, verify error is visible (not stuck in "queued")
13. Verify no references to old doc generator, phase parser, or `/generate` endpoint remain
