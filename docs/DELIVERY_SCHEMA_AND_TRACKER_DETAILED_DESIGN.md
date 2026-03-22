# Phase 3 — Delivery Schema & Tracker (Detailed Design)

## Problem

HQ currently parses phases from PLAN.md at runtime via regex (`phase-parser.ts`) and infers status by scanning an append-only log (`PLAN_PROGRESS_LOG.md`). This approach:

- Cannot model milestones, tasks, or releases — only flat phases
- Infers status from text pattern matching, which is fragile
- Cannot link agent runs to specific tasks (only a `phase_label` string)
- Cannot track milestone completion, MVP boundaries, or release versions
- Cannot support the 5-level decomposition methodology (see [ARCH.md](./ARCH.md) and [from-vision-to-version-number.html](./from-vision-to-version-number.html))

## Solution: Delivery-Side Data Model + State Machine

Replace the PLAN.md-parsed phase system with a structured delivery schema in SQLite. The new model tracks `milestones → phases → tasks` with proper foreign keys, status state machines, and agent-task linkage. A `DeliveryTracker` service manages all state transitions.

Planning artifacts (VISION.md, MILESTONES.md, ARCH.md, and detailed designs under `docs/detailed_design/`) remain as workspace files — this phase only builds the delivery side.

## Data Model

### Entity Relationship Diagram

```
projects
  ├──< milestones (ordered, one flagged as MVP boundary)
  │     └──< phases (coherent stages of work within a milestone)
  │           └──< tasks (from design docs)
  │                 └──< agent_runs (execution records)
  ├──< releases (semver-stamped)
  │     └──< release_milestones (join table)
  │           └──> milestones
  ├──< agent_runs (also linked from tasks)
  └──  (existing: background_processes, process_configs, kpi_snapshots, deploy_events)
```

### New Tables

#### `milestones`

Capability checkpoints within a project. Ordered. One may be flagged as the MVP boundary (last milestone in the MVP scope).

```typescript
export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  isMvpBoundary: integer("is_mvp_boundary").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
})
```

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | text | PK | UUID |
| `project_id` | text | FK → projects, NOT NULL, CASCADE | Parent project |
| `name` | text | NOT NULL | e.g., "Core invoicing", "Payments", "Dashboard" |
| `description` | text | nullable | What the user can do after this milestone completes |
| `sort_order` | integer | NOT NULL | Ordering within project (0-indexed) |
| `is_mvp_boundary` | integer | NOT NULL, default 0 | 1 = this is the last milestone in the MVP. All milestones up to and including this one constitute v1.0 |
| `status` | text | NOT NULL, default "pending" | `pending` · `active` · `completed` · `failed` |
| `created_at` | text | NOT NULL | ISO 8601 |
| `completed_at` | text | nullable | Set when status → `completed` |

**Status transitions:**
```
pending → active     (first phase starts)
active → completed   (all phases completed)
active → failed      (unrecoverable failure, user intervention needed)
failed → active      (user retries)
```

#### `phases`

Coherent stages of work within a milestone. Phase names should be descriptive and context-specific — e.g., "Data Model & API", "Payment Flow", "Error Handling & Tests", "Schema Migration", "UI Components". There is no fixed naming pattern; phases describe what they accomplish.

```typescript
export const phases = sqliteTable("phases", {
  id: text("id").primaryKey(),
  milestoneId: text("milestone_id")
    .notNull()
    .references(() => milestones.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  exitCriteria: text("exit_criteria"),
  sortOrder: integer("sort_order").notNull(),
  status: text("status").notNull().default("pending"),
  reviewResult: text("review_result"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
})
```

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | text | PK | UUID |
| `milestone_id` | text | FK → milestones, NOT NULL, CASCADE | Parent milestone |
| `name` | text | NOT NULL | e.g., "Data Model & API", "Payment Flow", "Error Handling & Tests" |
| `description` | text | nullable | What this phase accomplishes |
| `exit_criteria` | text | nullable | JSON array of criteria that must be met before the phase can pass review (e.g., tests pass, endpoints respond, schema validates) |
| `sort_order` | integer | NOT NULL | Ordering within milestone (0-indexed) |
| `status` | text | NOT NULL, default "pending" | `pending` · `active` · `reviewing` · `review_failed` · `completed` · `failed` |
| `review_result` | text | nullable | JSON object with the review agent's findings: criteria checked, pass/fail per criterion, issues found |
| `created_at` | text | NOT NULL | ISO 8601 |
| `completed_at` | text | nullable | Set when status → `completed` |

**Status transitions:**
```
pending → active            (first task starts or orchestrator begins phase)
active → reviewing          (all tasks completed, review agent spawned)
reviewing → review_failed   (review agent found unmet exit criteria)
reviewing → completed       (review agent confirms all criteria met — or user approves despite failures)
review_failed → active      (orchestrator spawns fix-up tasks based on review findings)
active → failed             (unrecoverable failure)
failed → active             (user retries)
```

#### `tasks`

Individual work items within a phase, derived from detailed design documents. The atomic unit of work that an agent executes.

```typescript
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  phaseId: text("phase_id")
    .notNull()
    .references(() => phases.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  sourceDoc: text("source_doc"),
  sortOrder: integer("sort_order").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
})
```

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | text | PK | UUID |
| `phase_id` | text | FK → phases, NOT NULL, CASCADE | Parent phase |
| `title` | text | NOT NULL | e.g., "Create payments table + migration" |
| `description` | text | nullable | Acceptance criteria, implementation notes |
| `source_doc` | text | nullable | Relative path to the design doc this task was derived from, e.g., `docs/detailed_design/Payments/stripe-adapter.md` |
| `sort_order` | integer | NOT NULL | Ordering within phase (0-indexed) |
| `status` | text | NOT NULL, default "pending" | `pending` · `in_progress` · `completed` · `failed` · `skipped` |
| `created_at` | text | NOT NULL | ISO 8601 |
| `completed_at` | text | nullable | Set when status → `completed` or `skipped` |

**Status transitions:**
```
pending → in_progress    (agent assigned)
in_progress → completed  (agent succeeds, exit code 0)
in_progress → failed     (agent fails, exit code != 0)
pending → skipped        (user skips)
failed → in_progress     (retry)
```

#### `releases`

Version-stamped releases. Loosely coupled to milestones — a release may span parts of multiple milestones, or one milestone may have multiple releases.

```typescript
export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  versionLabel: text("version_label").notNull(),
  tag: text("tag"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  publishedAt: text("published_at"),
})
```

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | text | PK | UUID |
| `project_id` | text | FK → projects, NOT NULL, CASCADE | Parent project |
| `version_label` | text | NOT NULL | Semver, e.g., "0.2.0" |
| `tag` | text | nullable | Full build tag for traceability, e.g., "0.2.0-20260319-a8f7b2c" |
| `notes` | text | nullable | Release notes (markdown) |
| `status` | text | NOT NULL, default "pending" | `pending` · `published` · `failed` |
| `created_at` | text | NOT NULL | ISO 8601 |
| `published_at` | text | nullable | Set when status → `published` |

**Status transitions:**
```
pending → published   (release stamped successfully)
pending → failed      (release process failed)
```

#### `release_milestones`

Join table linking releases to milestones. Many-to-many because a release can include multiple milestones and a milestone can appear in multiple releases (e.g., included in 0.2.0, also referenced in 1.0.0 MVP rollup).

```typescript
export const releaseMilestones = sqliteTable("release_milestones", {
  releaseId: text("release_id")
    .notNull()
    .references(() => releases.id, { onDelete: "cascade" }),
  milestoneId: text("milestone_id")
    .notNull()
    .references(() => milestones.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.releaseId, table.milestoneId] }),
}))
```

### Modified Tables

#### `projects` — add columns

```typescript
// Add to existing projects table definition:
visionHypothesis: text("vision_hypothesis"),  // extracted from VISION.md
successMetric: text("success_metric"),         // extracted from VISION.md
```

These columns cache the project's core vision data so the UI and orchestrator can access them without parsing VISION.md.

#### `agent_runs` — add `task_id`, keep `phase_label`

```typescript
// Add to existing agentRuns table definition:
taskId: text("task_id").references(() => tasks.id),  // nullable — ad-hoc/planning runs have no task
```

The existing `phase_label` column is **kept but deprecated**. New code should use `task_id`. Old agent runs with only `phase_label` continue to work. A future migration will drop `phase_label` after all references are removed.

## Delivery Tracker Service

### File: `lib/services/delivery-tracker.ts`

The delivery tracker is the state machine that manages all status transitions for milestones, phases, and tasks. It enforces valid transitions, handles cascading status updates, and detects milestone completion.

```typescript
export class DeliveryTracker {
  // ── Milestone operations ──

  /** Create milestones for a project from a structured list */
  createMilestones(
    projectId: string,
    milestones: Array<{
      name: string
      description?: string
      isMvpBoundary?: boolean
    }>
  ): MilestoneRecord[]

  /** Transition milestone status. Validates the transition is legal. */
  updateMilestoneStatus(
    milestoneId: string,
    status: MilestoneStatus
  ): MilestoneRecord

  /** Get all milestones for a project, ordered by sort_order */
  getMilestones(projectId: string): MilestoneRecord[]

  /** Get a single milestone with its phases and tasks */
  getMilestoneWithChildren(milestoneId: string): MilestoneWithChildren

  // ── Phase operations ──

  /** Create phases for a milestone */
  createPhases(
    milestoneId: string,
    phases: Array<{ name: string; description?: string }>
  ): PhaseRecord[]

  /** Transition phase status. May trigger review or cascade to milestone. */
  updatePhaseStatus(phaseId: string, status: PhaseStatus): PhaseRecord

  /** Store review agent findings on a phase */
  setPhaseReviewResult(phaseId: string, result: PhaseReviewResult): PhaseRecord

  /** Create fix-up tasks from failed review criteria */
  createFixUpTasks(phaseId: string, failedCriteria: FailedCriterion[]): TaskRecord[]

  /** Get all phases for a milestone, ordered by sort_order */
  getPhases(milestoneId: string): PhaseRecord[]

  // ── Task operations ──

  /** Create tasks for a phase from a structured list */
  createTasks(
    phaseId: string,
    tasks: Array<{
      title: string
      description?: string
      sourceDoc?: string
    }>
  ): TaskRecord[]

  /** Transition task status. May cascade to phase. */
  updateTaskStatus(taskId: string, status: TaskStatus): TaskRecord

  /** Get all tasks for a phase, ordered by sort_order */
  getTasks(phaseId: string): TaskRecord[]

  /** Get the next pending task in a phase (for agent assignment) */
  getNextPendingTask(phaseId: string): TaskRecord | null

  // ── Release operations ──

  /** Create a release and link it to milestones */
  createRelease(
    projectId: string,
    versionLabel: string,
    milestoneIds: string[],
    notes?: string
  ): ReleaseRecord

  /** Stamp a release as published */
  publishRelease(releaseId: string, tag?: string): ReleaseRecord

  /** Get all releases for a project */
  getReleases(projectId: string): ReleaseRecord[]

  // ── Task extraction ──

  /** Parse design docs and create tasks in the delivery schema */
  extractTasksFromDesignDocs(
    milestoneId: string,
    workspacePath: string
  ): TaskRecord[]

  // ── Cascade logic ──

  /** Check if all tasks in a phase are complete → phase → reviewing (triggers review agent) */
  private checkPhaseCompletion(phaseId: string): void

  /** Check if all phases in a milestone are complete → milestone → completed */
  private checkMilestoneCompletion(milestoneId: string): void

  // ── Query helpers ──

  /** Full project delivery tree: milestones → phases → tasks with statuses */
  getProjectDeliveryTree(projectId: string): ProjectDeliveryTree

  /** Completion stats for a project */
  getProjectProgress(projectId: string): {
    totalMilestones: number
    completedMilestones: number
    totalTasks: number
    completedTasks: number
    currentMilestone: MilestoneRecord | null
    currentPhase: PhaseRecord | null
  }
}
```

### Cascade Logic

Status changes cascade upward:

```
Task completes
  → Are all tasks in this phase completed/skipped?
    → Yes: Phase status → "reviewing", spawn review agent
    → No: Continue

Review agent completes
  → Did all exit criteria pass?
    → Yes: Phase status → "completed"
    → No: Phase status → "review_failed"
      → Review findings saved to phase.review_result
      → Orchestrator creates fix-up tasks from findings
      → Phase status → "active" (fix-up tasks execute)
      → When fix-up tasks complete → re-run review

Phase completed
  → Are all phases in this milestone completed?
    → Yes: Milestone status → "completed"
    → No: Is the next phase pending?
      → Yes: Next phase status → "active"

Task fails
  → Phase status stays "active" (other tasks may still be running)
  → User can retry the failed task or skip it
```

### Phase Review

When all tasks in a phase are completed or skipped, the orchestrator automatically spawns a **review agent** before the phase can be marked complete. The review agent:

1. **Reads the phase's exit criteria** from `phases.exit_criteria` (JSON array of criteria strings set during task extraction from the design docs)
2. **Runs the test suite** for the project (if a test command is configured) and checks for passing results
3. **Reviews the code changes** made during this phase (via `git diff` against the phase start point) for quality, consistency with the design doc, and adherence to coding standards
4. **Checks each exit criterion** and reports pass/fail with evidence

The review agent produces a structured result stored in `phases.review_result`:

```json
{
  "timestamp": "2026-03-22T...",
  "criteria": [
    {
      "criterion": "Invoice CRUD API returns valid responses for all methods",
      "passed": true,
      "evidence": "All 5 API route tests pass"
    },
    {
      "criterion": "Schema migration runs without errors",
      "passed": true,
      "evidence": "drizzle-kit generate produces clean migration"
    },
    {
      "criterion": "List view renders invoices with status badges",
      "passed": false,
      "evidence": "Status badge component not imported in list view",
      "suggestedFix": "Import StatusBadge from @/components/status-badge in invoice-list.tsx"
    }
  ],
  "testsRan": true,
  "testsPassed": 14,
  "testsFailed": 1,
  "overallPass": false
}
```

**When review fails**, the orchestrator:
1. Creates fix-up tasks from the failed criteria (using `suggestedFix` where available)
2. Transitions the phase back to `active`
3. Executes the fix-up tasks
4. Re-runs the review when all fix-up tasks complete

This loop continues until review passes or the user intervenes (force-approve or skip). The user can always override — approving a phase despite review failures, or manually editing the exit criteria.

**Exit criteria sources**: Exit criteria come from the detailed design docs during task extraction. The design skill should include an `## Exit Criteria` section in each design doc. If no explicit criteria exist, the review agent falls back to: (1) tests pass, (2) no lint errors, (3) code compiles.

### Task Extraction from Design Docs

The bridge between planning and delivery. After design skills produce detailed design files in the workspace, the delivery tracker parses them to create task records.

```typescript
extractTasksFromDesignDocs(milestoneId: string, workspacePath: string): TaskRecord[]
```

**Detailed design directory structure:**

Design docs are namespaced by phase under `docs/detailed_design/` to avoid filename collisions across milestones and keep the workspace navigable:

```
docs/
├── VISION.md
├── MILESTONES.md
├── ARCH.md
└── detailed_design/
    ├── Data_Model_and_API/
    │   ├── invoice-schema.md
    │   └── crud-endpoints.md
    ├── Payment_Flow/
    │   ├── stripe-adapter.md
    │   └── webhook-handler.md
    └── Error_Handling_and_Tests/
        ├── retry-logic.md
        └── integration-tests.md
```

Each subdirectory under `detailed_design/` corresponds to a phase. Each file within is the detailed design for a single component. The directory name becomes the phase name. The design skill creates this structure; the delivery tracker reads it.

**Strategy:**
1. Glob `docs/detailed_design/*/` in the workspace — each subdirectory is a phase
2. For each phase directory, glob `*.md` files — each file is a component design
3. For each design doc, parse task lists (lines matching `- [ ] ...` or `| task | ... |` table rows)
4. Create phase records from the directory names, task records from the parsed tasks, linked to the phase and referencing the source design doc path
5. Return the created task records

**Design doc task format** (recognized patterns):
```markdown
## Tasks
- [ ] Create payments table + migration
- [ ] Stripe SDK setup + env config
- [ ] StripeAdapter interface + createCheckout

## Phase A: Foundation
- [ ] Create payments table + migration
- [ ] Stripe SDK setup + env config
```

Or table format:
```markdown
| Task | Description |
|------|-------------|
| Create payments table | Add migration for payments schema |
```

## Orchestrator Changes

### Current: `lib/services/orchestrator.ts`

The orchestrator currently:
1. Reads phases from PLAN.md via `parsePhasesFromPlan()`
2. Builds an agent prompt from the phase name + exit criteria
3. Spawns an agent with `phaseLabel: "Phase N"` string
4. Logs to PLAN_PROGRESS_LOG.md
5. Handles approve/reject/skip actions by appending to the log

### New: Orchestrator uses DeliveryTracker

Replace all PLAN.md parsing with delivery tracker queries. The orchestrator becomes a coordinator between the delivery tracker and the agent manager.

```typescript
export class Orchestrator {
  private deliveryTracker: DeliveryTracker
  private agentManager: AgentManager

  /** Start the next pending task in a phase */
  async startTask(taskId: string): Promise<string> {
    // 1. Get task, phase, milestone, project from DB (join up the chain)
    // 2. Update task status → in_progress
    // 3. Update phase status → active (if pending)
    // 4. Update milestone status → active (if pending)
    // 5. Update project status → building (if not already)
    // 6. Build agent prompt from task title + description + source design doc
    // 7. Spawn agent via AgentManager with task_id
    // 8. Return agentId
  }

  /** Start all pending tasks in a phase sequentially */
  async startPhase(phaseId: string): Promise<string[]> {
    // Get all pending tasks in this phase
    // Start the first one (sequential execution by default)
    // Return agentIds
  }

  /** Handle task completion (called by agent manager when agent finishes) */
  async onTaskCompleted(taskId: string, success: boolean): Promise<void> {
    // 1. Update task status → completed or failed
    // 2. deliveryTracker.checkPhaseCompletion(phaseId)
    // 3. If all tasks done → phase → "reviewing", spawn review agent
    // 4. If tasks still pending, start next task
  }

  /** Spawn the review agent for a phase */
  async startPhaseReview(phaseId: string): Promise<string> {
    // 1. Get phase with exit criteria, milestone, project
    // 2. Build review prompt: exit criteria, test command, git diff range
    // 3. Spawn review agent (agent_type: "claude_code", task_id: null)
    // 4. Return agentId
  }

  /** Handle review agent completion */
  async onPhaseReviewCompleted(phaseId: string, result: PhaseReviewResult): Promise<void> {
    // 1. Store result via deliveryTracker.setPhaseReviewResult()
    // 2. If all criteria passed → phase → "completed", check milestone cascade
    // 3. If criteria failed → phase → "review_failed"
    //    → Create fix-up tasks from failed criteria
    //    → Phase → "active", start fix-up tasks
  }

  /** Handle user override on a phase */
  async handlePhaseAction(
    phaseId: string,
    action: "approve" | "reject" | "skip"
  ): Promise<{ nextPhaseId?: string }> {
    // approve: phase → completed (even if review_failed), check milestone completion, return next phase
    // reject: reset tasks, phase → active
    // skip: phase → completed (tasks → skipped), check milestone, return next phase
  }

  /** Handle user approval of a milestone */
  async handleMilestoneAction(
    milestoneId: string,
    action: "approve" | "reject"
  ): Promise<{ nextMilestoneId?: string }> {
    // approve: milestone → completed, optionally stamp release, return next milestone
    // reject: re-open last phase for rework
  }

  /** Build agent prompt for a specific task */
  private buildTaskPrompt(
    task: TaskRecord,
    phase: PhaseRecord,
    milestone: MilestoneRecord,
    project: ProjectRecord,
  ): string {
    // Include:
    // - Project name + original prompt
    // - Milestone context: "You are working on milestone: {name} — {description}"
    // - Phase context: "Current phase: {name}"
    // - Task: "Your task: {title}\n{description}"
    // - Source doc: "Read {source_doc} for the detailed design."
    // - Standard instructions: read docs/, log progress
  }
}
```

### Agent Prompt Construction

The prompt changes from phase-level to task-level:

**Before (phase-level):**
```
You are working on project "Invoicer".
Original project prompt: Freelancer invoicing SaaS...

Your task is to implement Phase 2: Agent Execution

Exit criteria:
- HQ spawns Claude agents...
- Background processes managed...

Read the project's docs/ directory first...
```

**After (task-level):**
```
You are working on project "Invoicer".
Original project prompt: Freelancer invoicing SaaS...

Milestone: M2 Payments — Accept Stripe payments
Phase: Foundation (1 of 3)
Task: Create payments table + migration

Read docs/DESIGN_STRIPE_ADAPTER.md for the detailed design of this component.

Implement this task. When done, commit your changes with a message describing what you built.
Read the project's docs/ directory for full context if needed.
```

## API Routes

### New Routes

#### `GET /api/projects/:id/milestones`

Returns the full delivery tree for a project.

```json
{
  "milestones": [
    {
      "id": "m1",
      "name": "Core invoicing",
      "description": "Create and send invoices",
      "sortOrder": 0,
      "isMvpBoundary": false,
      "status": "completed",
      "phases": [
        {
          "id": "p1",
          "name": "Foundation",
          "status": "completed",
          "tasks": [
            { "id": "t1", "title": "Invoice data model", "status": "completed" },
            { "id": "t2", "title": "CRUD API", "status": "completed" }
          ]
        }
      ]
    },
    {
      "id": "m2",
      "name": "Payments",
      "status": "active",
      "isMvpBoundary": false,
      "phases": [...]
    },
    {
      "id": "m3",
      "name": "Dashboard",
      "status": "pending",
      "isMvpBoundary": true,
      "phases": []
    }
  ],
  "progress": {
    "totalMilestones": 3,
    "completedMilestones": 1,
    "totalTasks": 24,
    "completedTasks": 8
  }
}
```

#### `PATCH /api/projects/:id/milestones`

Perform actions on milestones, phases, or tasks.

```json
// Start a task
{ "action": "startTask", "taskId": "t3" }
// → { "agentId": "a1" }

// Start all tasks in a phase
{ "action": "startPhase", "phaseId": "p2" }
// → { "agentIds": ["a1", "a2"] }

// Approve a phase (works from "reviewing", "review_failed", or "completed")
{ "action": "approvePhase", "phaseId": "p1" }
// → { "nextPhaseId": "p2" }

// Reject a phase (resets tasks, re-runs)
{ "action": "rejectPhase", "phaseId": "p1" }
// → { "phaseId": "p1", "status": "active" }

// Re-run review on a phase
{ "action": "reReviewPhase", "phaseId": "p1" }
// → { "agentId": "a3", "phaseId": "p1", "status": "reviewing" }

// Get review results for a phase
{ "action": "getPhaseReview", "phaseId": "p1" }
// → { "reviewResult": { "criteria": [...], "overallPass": false } }

// Skip a task
{ "action": "skipTask", "taskId": "t5" }
// → { "taskId": "t5", "status": "skipped" }

// Retry a failed task
{ "action": "retryTask", "taskId": "t3" }
// → { "agentId": "a2" }

// Approve a milestone
{ "action": "approveMilestone", "milestoneId": "m1" }
// → { "nextMilestoneId": "m2" }
```

#### `GET /api/projects/:id/releases`

List releases for a project.

```json
{
  "releases": [
    {
      "id": "r1",
      "versionLabel": "0.1.0",
      "status": "published",
      "milestones": ["m1"],
      "publishedAt": "2026-03-20T..."
    }
  ]
}
```

#### `POST /api/projects/:id/releases`

Create and optionally publish a release.

```json
// Request
{
  "versionLabel": "0.2.0",
  "milestoneIds": ["m2"],
  "notes": "Stripe payments integration",
  "publish": true
}

// Response
{
  "id": "r2",
  "versionLabel": "0.2.0",
  "status": "published",
  "tag": "0.2.0-20260322-b3c4d5e"
}
```

### Modified Routes

#### `PATCH /api/projects/:id/phases` → deprecated

Keep the existing route working for backwards compatibility but have it delegate to the new milestones endpoint internally. Mark as deprecated — the UI should migrate to `/milestones`.

#### `POST /api/agents` → add `taskId`

Update the Zod schema to accept `taskId` (optional) alongside the deprecated `phaseLabel`/`phaseNumber`:

```typescript
const spawnAgentSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1),
  taskId: z.string().optional(),          // new — preferred
  phaseLabel: z.string().optional(),       // deprecated
  phaseNumber: z.number().int().positive().optional(),  // deprecated
  model: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  maxBudgetUsd: z.number().positive().optional(),
})
```

## Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/services/delivery-tracker.ts` | DeliveryTracker class — state machine for milestones, phases, tasks, releases |
| `lib/services/delivery-tracker.test.ts` | Tests for state transitions, cascade logic, task extraction |
| `app/api/projects/[id]/milestones/route.ts` | GET delivery tree, PATCH actions |
| `app/api/projects/[id]/releases/route.ts` | GET list, POST create/publish |

### Modified Files

| File | Change |
|------|--------|
| `lib/db/schema.ts` | Add `milestones`, `phases`, `tasks`, `releases`, `releaseMilestones` tables. Add `visionHypothesis`, `successMetric` to `projects`. Add `taskId` to `agentRuns` |
| `lib/services/orchestrator.ts` | Replace PLAN.md parsing with DeliveryTracker queries. New methods: `startTask`, `onTaskCompleted`, `handleMilestoneAction`. Update `startPhase` and `handlePhaseAction` to use DB. Remove `getPhases`, `getPhase`, `buildPhasePrompt` |
| `app/api/projects/[id]/phases/route.ts` | Deprecate: delegate GET to delivery tracker, delegate PATCH to new milestones route |
| `app/api/agents/route.ts` | Add `taskId` to spawn schema, write `task_id` to `agent_runs` record |

### Not Modified (unchanged)

| File | Why |
|------|-----|
| `lib/process/agent-manager.ts` | AgentManager is unaware of tasks — it just spawns agents. The orchestrator handles the task→agent mapping |
| `lib/process/process-registry.ts` | No changes needed |
| `lib/process/hq-mcp-server.ts` | No changes needed |
| `lib/services/phase-parser.ts` | Kept for backwards compatibility / migration, but no longer called by orchestrator |

## Migration Strategy

This is an additive migration — new tables and columns only, no destructive changes.

1. **Add new tables**: `milestones`, `phases`, `tasks`, `releases`, `release_milestones`
2. **Add columns**: `projects.vision_hypothesis`, `projects.success_metric`, `agent_runs.task_id`
3. **Run**: `cd apps/hq && npx drizzle-kit generate` to create migration files
4. **Migrations apply automatically** on app startup via `migrate()`
5. **No data migration needed**: existing projects continue working with the deprecated phases route. New projects use the delivery tracker.

Existing `agent_runs` rows with `phase_label` but no `task_id` remain valid. The UI should display them grouped by `phase_label` for old projects and by task for new projects.

## Singleton Pattern

Match the existing orchestrator pattern:

```typescript
const DELIVERY_TRACKER_KEY = Symbol.for("auteng.deliveryTracker")

export function getDeliveryTracker(): DeliveryTracker {
  const g = globalThis as Record<symbol, DeliveryTracker | undefined>
  if (!g[DELIVERY_TRACKER_KEY]) {
    g[DELIVERY_TRACKER_KEY] = new DeliveryTracker()
  }
  return g[DELIVERY_TRACKER_KEY]
}
```

## Test Plan

| Test | What it verifies |
|------|-----------------|
| **Milestone CRUD** | Create milestones for project, read back ordered, MVP boundary flag works |
| **Phase CRUD** | Create phases for milestone with descriptive names, read back ordered |
| **Task CRUD** | Create tasks for phase, read back ordered, source_doc stored |
| **Milestone status transitions** | pending→active, active→completed, active→failed, failed→active. Invalid transitions throw |
| **Phase status transitions** | pending→active→reviewing→completed. reviewing→review_failed→active (fix-up loop). Invalid transitions throw |
| **Task status transitions** | pending→in_progress→completed. pending→skipped. in_progress→failed. failed→in_progress (retry) |
| **Task→phase cascade** | All tasks completed → phase auto-transitions to reviewing, review agent spawned |
| **Phase review pass** | Review agent reports all criteria met → phase → completed |
| **Phase review fail** | Review agent reports failed criteria → phase → review_failed → fix-up tasks created → phase → active |
| **Phase review fix-up loop** | Fix-up tasks complete → re-review triggers → passes on second attempt |
| **Phase force-approve** | User approves despite review_failed → phase → completed |
| **Phase→milestone cascade** | All phases completed → milestone auto-transitions to completed |
| **Partial completion** | Some tasks fail, phase stays active. Skipped tasks don't block completion |
| **Phase rejection** | Reject resets completed/failed tasks to pending, phase → active |
| **Exit criteria from design docs** | Task extraction parses `## Exit Criteria` sections and stores on phase record |
| **Task extraction** | Parse `docs/detailed_design/*/` structure → creates phases from directories, tasks from design doc contents |
| **Task extraction with phases** | Subdirectories under `detailed_design/` → one phase per directory, tasks grouped correctly |
| **Release creation** | Create release with semver, link to milestones, publish with tag |
| **Agent-task linkage** | Spawned agent has task_id in agent_runs record |
| **Orchestrator startTask** | Creates agent run with task_id, updates task→in_progress, phase→active, milestone→active |
| **Orchestrator onTaskCompleted** | Success: task→completed, checks phase cascade. Failure: task→failed |
| **Orchestrator startPhaseReview** | Spawns review agent with exit criteria, test command, git diff |
| **Orchestrator onPhaseReviewCompleted** | Pass: phase→completed. Fail: creates fix-up tasks, phase→active |
| **Project delivery tree** | Full tree query returns milestones→phases→tasks with correct nesting and statuses |
| **Progress stats** | Correct counts for total/completed milestones and tasks |
| **API GET milestones** | Returns nested tree with progress stats |
| **API PATCH actions** | startTask, approvePhase, rejectPhase, skipTask, retryTask all work |
| **Backwards compat** | Old phases route still works for projects without milestones |

## Smoke Test

1. Create a project via the existing flow (PLAN.md generated)
2. Call `POST /api/projects/:id/milestones` — verify empty response (no milestones yet)
3. Programmatically create milestones via `DeliveryTracker.createMilestones()`:
   ```
   M1: Core invoicing (sort 0)
   M2: Payments (sort 1)
   M3: Dashboard (sort 2, MVP boundary)
   ```
4. Create phases for M1: "Invoice Data Model", "CRUD API & Validation", "List & Detail Views"
5. Create tasks for M1/Foundation: "Invoice data model", "CRUD API", "List view"
6. `GET /api/projects/:id/milestones` — verify full tree with all pending
7. Start first task → verify agent spawned with `task_id`, task → `in_progress`, phase → `active`, milestone → `active`
8. Simulate agent completion → verify task → `completed`, check cascade
9. Complete all tasks in phase → verify phase → `reviewing`, review agent spawned
10. Simulate review agent completion (all criteria pass) → verify phase → `completed`, next phase → `active`
11. Complete all tasks in next phase → verify phase → `reviewing`
12. Simulate review agent completion (one criterion fails) → verify phase → `review_failed`, fix-up task created
13. Complete fix-up task → verify re-review triggers → simulate pass → phase → `completed`
14. Alternatively: force-approve a `review_failed` phase → verify phase → `completed`
15. Complete all phases → verify milestone → `completed`
16. Create release `0.1.0` linked to M1 → verify release record and join table
17. Verify old `/api/projects/:id/phases` route still returns data for this project
