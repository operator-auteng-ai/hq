# Phase 4 — Planning Skills (Detailed Design)

## Problem

HQ's doc generator (`lib/services/doc-generator.ts`) is a monolithic pipeline that generates 5 flat docs (VISION, ARCH, PLAN, TAXONOMY, CODING-STANDARDS) from a single prompt via chained Claude API calls. This approach:

- Produces generic, unfocused docs — no hypothesis/success metric extraction, no milestone decomposition, no per-component design
- Cannot produce the structured artifacts needed by the delivery tracker (milestones, phases with exit criteria, tasks linked to design docs)
- Is not improvable at individual levels — tuning the architecture prompt means re-running the entire chain
- Does not follow the 5-level decomposition methodology (see [ARCH.md](./ARCH.md) and [from-vision-to-version-number.html](./from-vision-to-version-number.html))

## Solution: Skills-Based Planning Engine

Replace the monolithic doc generator with a **Planning Engine** that runs 4 skills in sequence, each producing focused workspace files at one decomposition level. Skills are structured prompt files (`SKILL.md`) installed into project workspaces. Each skill is run by spawning a Claude agent with the skill as context.

```
Vision prompt
  → Vision skill      → VISION.md (hypothesis + success metric)
  → Milestone skill    → MILESTONES.md (ordered milestones, MVP boundary)
  → Architecture skill → ARCH.md (components per milestone)
  → Design skill       → docs/detailed_design/<Phase>/<component>.md
  → Task extraction    → delivery schema populated (milestones, phases, tasks in DB)
```

After the design skill completes, the Planning Engine calls `DeliveryTracker.extractTasksFromDesignDocs()` to bridge planning files into the delivery schema.

## Skills

### Skill File Format

Skills are markdown files with YAML frontmatter. They live in the HQ repo at `skills/<name>/SKILL.md` and are copied into project workspaces at `skills/<name>/SKILL.md` during project creation.

```yaml
---
name: <skill-name>
description: >
  One-paragraph description of what this skill does
  and when to use it.
---

# <Skill Title>

<instructions for the agent>
```

The agent receives the skill file content as part of its prompt. The skill defines what to read, what to produce, and what format to follow.

### Skill 1: Vision (`skills/vision/SKILL.md`)

**Input**: User's original product prompt
**Output**: `docs/VISION.md`
**Collaboration**: Always pauses for user review (all profiles)

The vision skill extracts two core elements from the user's prompt:

1. **Hypothesis** — the bet this project is making (e.g., "Freelancers get paid faster with less friction")
2. **Success metric** — how you know the bet is working (e.g., "50 paying users in 90 days")

The skill produces a focused VISION.md following this structure:

```markdown
# VISION — <Project Name>

## Hypothesis
<one sentence: what should exist and why>

## Success Metric
<one measurable outcome with a number and timeframe>

## Problem
<2-3 sentences: what pain exists today>

## Solution
<2-3 sentences: what this product does about it>

## Target User
<who specifically uses this — one sentence, concrete>

## What This Is NOT
<2-3 bullets of explicit non-goals>
```

**Key instruction to the agent**: Do not pad. Every section is 1-3 sentences maximum. If the user's prompt is vague, make the hypothesis specific and falsifiable — the user will refine it in review. Extract the implicit bet, don't echo the prompt back.

### Skill 2: Milestones (`skills/milestones/SKILL.md`)

**Input**: `docs/VISION.md` (from skill 1)
**Output**: `docs/MILESTONES.md`
**Collaboration**: Pauses for review in `operator` and `architect` profiles

The milestone skill decomposes the vision into ordered capability checkpoints. Each milestone answers: "what can the user do now that they couldn't before?"

The skill produces a MILESTONES.md following this structure:

```markdown
# MILESTONES — <Project Name>

## MVP Scope

### M1: <Name>
<one sentence: what the user can do after this milestone>

### M2: <Name>
<one sentence>

### M3: <Name> ← MVP
<one sentence>

---

## Post-MVP

### M4: <Name>
<one sentence>

### M5: <Name>
<one sentence>
```

**Key instructions to the agent**:
- Milestones are capabilities, not tasks. "User can create and send invoices" not "Set up database"
- The MVP boundary should be the minimum set that tests the vision hypothesis
- 3-5 milestones for MVP is typical. More than 7 total suggests the vision is too broad
- Order matters — each milestone should build on the previous one
- Read VISION.md first. The milestones must test the hypothesis stated there

### Skill 3: Architecture (`skills/architecture/SKILL.md` — update existing)

**Input**: `docs/VISION.md`, `docs/MILESTONES.md`, current milestone name
**Output**: Updates to `docs/ARCH.md`
**Collaboration**: Pauses for review in `architect` profile
**Note**: This skill already exists. The update scopes it to work per-milestone rather than for the whole system at once.

The architecture skill identifies what components a specific milestone needs and how they connect. It does NOT design the whole system — only the slice needed for the current milestone.

**Changes to existing skill**:
- Add a "Per-Milestone Scope" section explaining that architecture is revealed incrementally
- Add instruction to read MILESTONES.md and focus only on the named milestone
- Add instruction to check existing ARCH.md and extend it rather than replace it
- Add instruction to list components that the design skill should produce detailed designs for

The skill appends to ARCH.md with a milestone-scoped section:

```markdown
## M2: Payments — Architecture

### Components
- Payment service layer (Stripe adapter, webhook handler, ledger service)
- API routes (`/api/payments/*`)
- Payments table (Postgres)
- Job queue (background processing)

### Component Diagram
<mermaid graph>

### Components Requiring Detailed Design
- Stripe adapter
- Webhook handler
- Ledger service
```

The "Components Requiring Detailed Design" list drives what the design skill produces next.

### Skill 4: Design (`skills/design/SKILL.md`)

**Input**: `docs/VISION.md`, `docs/MILESTONES.md`, `docs/ARCH.md`, component name
**Output**: `docs/detailed_design/<Phase_Name>/<component-name>.md`
**Collaboration**: Pauses for review in `architect` profile

The design skill produces the detailed specification for a single component. This is the last planning artifact before code — it should be specific enough that a developer (or agent) can implement it without further questions.

Each design doc follows this structure:

```markdown
# <Component Name> — Detailed Design

## Purpose
<one sentence: what this component does>

## Interface

```typescript
// public API — types and function signatures only
```

## Data Model

```typescript
// table definition or type shape
```

## Behaviour

### Happy Path
<numbered steps or sequence diagram>

### Error States
<table or list: condition → handling>

## Tasks
- [ ] <task 1>
- [ ] <task 2>
- [ ] <task 3>

## Exit Criteria
- <criterion 1>
- <criterion 2>
- <criterion 3>
```

**Key instructions to the agent**:
- Interface section: types and function signatures only, no implementation bodies
- Data model: if this component owns DB tables, show the Drizzle schema. If it consumes data, show the expected input shape
- Tasks: concrete, implementable work items. Each task should be completable in a single agent session. Prefer too many small tasks over too few large ones
- Exit criteria: things a review agent can verify — "tests pass", "endpoint returns 200", "migration runs". Not subjective ("code is clean")
- Write the file to `docs/detailed_design/<Phase_Name>/<component-name>.md` where `<Phase_Name>` is the phase directory the component belongs to (e.g., `Payment_Flow/stripe-adapter.md`)

**Phase directory assignment**: The design skill should group components into phase directories based on natural implementation order and dependency. Components that share data models or that must be built together go in the same phase directory. The directory name becomes the phase name in the delivery tracker.

## Planning Engine Service

### File: `lib/services/planning-engine.ts`

The planning engine orchestrates the skill sequence. It spawns agents with skill context, waits for completion, and bridges results into the delivery schema.

```typescript
export interface PlanningEngineConfig {
  model: string
  apiKey: string
  maxTurns?: number
  maxBudgetUsd?: number
}

export class PlanningEngine {
  /**
   * Run the full planning pipeline for a project.
   * Emits progress events for UI updates.
   */
  async runPipeline(
    projectId: string,
    config: PlanningEngineConfig,
    onProgress?: (event: PlanningProgressEvent) => void,
  ): Promise<PlanningResult>

  /**
   * Run a single skill for a project.
   * Used for re-planning (e.g., re-run architecture for a specific milestone).
   */
  async runSkill(
    projectId: string,
    skillName: SkillName,
    config: PlanningEngineConfig,
    context?: SkillContext,
  ): Promise<SkillResult>
}
```

### Pipeline Flow

```
1. Read project record (prompt, workspace path)
2. Run vision skill
   a. Build prompt: skill content + user's original prompt
   b. Spawn agent via AgentManager (cwd: workspace, no task_id)
   c. Wait for completion
   d. Verify VISION.md was created in workspace
   e. Extract hypothesis + success_metric, update project record
   f. Emit progress event: { level: "vision", status: "completed" }
   g. If collaborative: emit { level: "vision", status: "awaiting_review" }, pause

3. Run milestone skill
   a. Build prompt: skill content + "Read docs/VISION.md for context"
   b. Spawn agent, wait for completion
   c. Verify MILESTONES.md was created
   d. Parse milestones from MILESTONES.md
   e. Create milestone records in DB via DeliveryTracker.createMilestones()
   f. Emit progress, optionally pause for review

4. For each milestone:
   a. Run architecture skill
      - Build prompt: skill content + milestone name + "Read VISION.md and MILESTONES.md"
      - Spawn agent, wait for completion
      - Parse "Components Requiring Detailed Design" list from ARCH.md

   b. For each component requiring design:
      - Run design skill
        - Build prompt: skill content + component name + "Read ARCH.md for context"
        - Spawn agent, wait for completion
        - Verify design doc created under docs/detailed_design/

   c. Run task extraction
      - Call DeliveryTracker.extractTasksFromDesignDocs(milestoneId, workspacePath)
      - This creates phase and task records in DB from the detailed_design/ structure

5. Update project status: "planning" → "building" (ready for delivery)
6. Return PlanningResult with summary
```

### Progress Events

The planning engine emits structured events so the UI can show real-time progress:

```typescript
export type SkillName = "vision" | "milestones" | "architecture" | "design"

export interface PlanningProgressEvent {
  level: SkillName | "task_extraction"
  status: "running" | "completed" | "awaiting_review" | "failed"
  detail?: string        // e.g., milestone name, component name
  agentId?: string       // for linking to agent output stream
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
```

### Agent Prompt Construction

Each skill run builds a prompt from three parts:

1. **Skill content** — the full SKILL.md file (instructions, format, rules)
2. **Context instruction** — what existing docs to read (e.g., "Read docs/VISION.md first")
3. **Specific input** — the user's prompt (for vision) or a scoping instruction (e.g., "Focus on milestone: M2 Payments")

```typescript
private buildSkillPrompt(
  skillContent: string,
  projectPrompt: string,
  context: SkillContext,
): string {
  const parts = [
    skillContent,
    "",
    `Project prompt: ${projectPrompt}`,
  ]

  if (context.milestoneName) {
    parts.push(`Focus on milestone: ${context.milestoneName}`)
  }
  if (context.componentName) {
    parts.push(`Design component: ${context.componentName}`)
    if (context.phaseName) {
      parts.push(
        `Write to: docs/detailed_design/${context.phaseName}/${context.componentName}.md`,
      )
    }
  }

  parts.push(
    "",
    "Read the project's docs/ directory for existing context before writing.",
    "Write your output files directly — do not explain what you would write.",
  )

  return parts.join("\n")
}
```

### Milestone Parsing from MILESTONES.md

After the milestone skill runs, the engine parses the generated MILESTONES.md to create DB records:

```typescript
export interface ParsedMilestone {
  name: string
  description: string
  isMvpBoundary: boolean
}

export function parseMilestonesDoc(content: string): ParsedMilestone[] {
  // Match: ### M1: <Name> or ### M1: <Name> ← MVP
  // Capture description from the line below
  // Detect MVP boundary from "← MVP" suffix or position under "## MVP Scope"
}
```

### Architecture Component Parsing

After the architecture skill runs, the engine parses the "Components Requiring Detailed Design" section:

```typescript
export function parseArchComponentList(
  archContent: string,
  milestoneName: string,
): string[] {
  // Find the milestone section in ARCH.md
  // Extract bullet list under "### Components Requiring Detailed Design"
  // Return component names
}
```

## Skill Installer

### File: `lib/services/skill-installer.ts`

Copies skill files from HQ's `skills/` directory into the project workspace during project creation.

```typescript
export function installSkills(workspacePath: string): void {
  // 1. Resolve HQ's skills directory (relative to project root or bundled in Electron)
  // 2. Copy skills/vision/SKILL.md → <workspace>/skills/vision/SKILL.md
  // 3. Copy skills/milestones/SKILL.md → <workspace>/skills/milestones/SKILL.md
  // 4. Copy skills/architecture/SKILL.md → <workspace>/skills/architecture/SKILL.md
  // 5. Copy skills/design/SKILL.md → <workspace>/skills/design/SKILL.md
  // 6. git add skills/ && git commit -m "chore: install planning skills"
}
```

Skills are installed once at project creation. If skills are updated in HQ, existing projects keep their original versions (immutable per project). Users can manually update skills by copying new versions into their workspace.

### Electron Bundling

In production, skills must be bundled with the Electron app:

- Add `skills/` to `electron-builder.yml` `extraResources`
- Resolve via `process.resourcesPath` in production, relative path in dev

## Project Creation Flow Changes

### Current Flow (to be replaced)

```
POST /api/projects → create project record
POST /api/projects/:id/generate → monolithic doc generator
  → Claude API chain: VISION → ARCH → PLAN → TAXONOMY + CODING-STANDARDS
  → Write all docs to workspace
  → git commit
```

### New Flow

```
POST /api/projects → create project record
POST /api/projects/:id/plan → planning engine
  → Install skills into workspace
  → Run vision skill (agent)
  → [User review if collaborative]
  → Run milestone skill (agent)
  → [User review if collaborative]
  → For each milestone:
    → Run architecture skill (agent)
    → [User review if collaborative]
    → For each component:
      → Run design skill (agent)
    → Extract tasks → populate delivery schema
  → Update project status
```

### API Changes

#### New: `POST /api/projects/:id/plan`

Replaces the `generate` endpoint. Starts the planning pipeline.

```json
// Request
{
  "model": "sonnet",
  "collaborationProfile": "operator"
}

// Response (SSE stream)
event: progress
data: {"level":"vision","status":"running"}

event: progress
data: {"level":"vision","status":"completed","agentId":"a1"}

event: progress
data: {"level":"vision","status":"awaiting_review"}

// ... user approves via orchestrator chat or UI ...

event: progress
data: {"level":"milestones","status":"running"}

// ... etc ...

event: complete
data: {"success":true,"milestonesCreated":3,"phasesCreated":8,"tasksCreated":24}
```

#### Existing: `POST /api/projects/:id/generate` → deprecated

Keep working for backwards compatibility. Internally delegates to the old doc generator. Mark as deprecated in code comments.

### UI Changes

The project creation flow needs updates to support the multi-step planning pipeline:

#### Planning Progress View

On the project detail page, when planning is in progress, show a vertical progress indicator with the 4 skill levels. Each level shows:

- **Pending**: Muted text, no icon
- **Running**: Primary-coloured spinner, agent output expandable
- **Awaiting review**: Amber indicator, "Review" button that opens the generated doc
- **Completed**: Green check

```
┌─────────────────────────────────────────────────┐
│ Planning — Invoicing SaaS                       │
│                                                 │
│  ✓  Vision          VISION.md created           │
│  ✓  Milestones      3 milestones (MVP: M3)      │
│  ●  Architecture    M1: Core invoicing...       │
│  ○  Design          Waiting                     │
│  ○  Tasks           Waiting                     │
│                                                 │
│  [View Agent Output]                            │
└─────────────────────────────────────────────────┘
```

**Token usage**: Status indicators use the existing semantic status tokens — `--status-completed` (green), `--status-running` (primary), `--status-queued` (muted), `--status-paused` (amber for awaiting review).

**Typography**: Level names in `text-sm font-medium`, detail text in `text-sm text-muted-foreground`.

**Layout**: Vertical stack with `gap-3`, each row is a flex row with icon (16px), level name (fixed width), and detail text.

#### Review Interstitial

When a skill completes and the collaboration profile requires review, show an inline review panel below the progress indicator:

```
┌─────────────────────────────────────────────────┐
│ Review: Milestones                              │
│                                                 │
│  M1: Core invoicing — Create and send invoices  │
│  M2: Payments — Accept Stripe payments          │
│  M3: Dashboard — Revenue tracking    ← MVP      │
│                                                 │
│  [ Edit in workspace ]  [ Approve ]  [ Regen ]  │
└─────────────────────────────────────────────────┘
```

- **Approve**: Continue to next skill
- **Regen**: Re-run this skill with the same inputs
- **Edit in workspace**: Open the file in the system editor, then approve when done

Uses `bg-card` surface, `rounded-lg`, `border-border`, `p-4`.

#### Component: `PlanningProgress`

New molecule component for the project detail page.

```typescript
// components/planning-progress.tsx
export interface PlanningProgressProps {
  projectId: string
  events: PlanningProgressEvent[]
  onApprove: (level: SkillName) => void
  onRegenerate: (level: SkillName) => void
}
```

- Consumes SSE stream from `/api/projects/:id/plan`
- Renders vertical step list
- Shows inline review panel when `awaiting_review`
- Expands agent output on click (reuses existing `AgentOutput` component)

Add to component registry as molecule under "Project" sublabel.

## Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `skills/vision/SKILL.md` | Vision skill prompt |
| `skills/milestones/SKILL.md` | Milestone skill prompt |
| `skills/design/SKILL.md` | Design skill prompt |
| `lib/services/planning-engine.ts` | PlanningEngine class — skill sequencing, agent spawning, progress events |
| `lib/services/planning-engine.test.ts` | Tests for pipeline sequencing, milestone parsing, component parsing |
| `lib/services/skill-installer.ts` | Copy skills into project workspace |
| `lib/services/skill-installer.test.ts` | Tests for skill installation |
| `app/api/projects/[id]/plan/route.ts` | SSE endpoint for planning pipeline |
| `components/planning-progress.tsx` | Planning progress UI component |

### Modified Files

| File | Change |
|------|--------|
| `skills/architecture/SKILL.md` | Add per-milestone scoping instructions, "Components Requiring Detailed Design" output section |
| `lib/services/workspace.ts` | Call `installSkills()` during workspace creation |
| `app/projects/[id]/page.tsx` | Add planning progress view when project status is `planning` |
| `app/projects/new/page.tsx` | Update to call `/plan` endpoint instead of `/generate` |
| `components/registry/entries.ts` | Add `PlanningProgress` entry |

### Not Modified

| File | Why |
|------|-----|
| `lib/services/doc-generator.ts` | Kept for backwards compatibility. Deprecated, not deleted |
| `lib/services/delivery-tracker.ts` | Already has `extractTasksFromDesignDocs()` — no changes needed |
| `lib/services/orchestrator.ts` | Not touched until Phase 3.9 (orchestrator rewrite). Planning engine operates independently |

## Singleton Pattern

```typescript
const PLANNING_ENGINE_KEY = Symbol.for("auteng.planningEngine")

export function getPlanningEngine(): PlanningEngine {
  const g = globalThis as Record<symbol, PlanningEngine | undefined>
  if (!g[PLANNING_ENGINE_KEY]) {
    g[PLANNING_ENGINE_KEY] = new PlanningEngine()
  }
  return g[PLANNING_ENGINE_KEY]
}
```

## Test Plan

| Test | What it verifies |
|------|-----------------|
| **parseMilestonesDoc** | Parses well-formed MILESTONES.md into structured array with MVP boundary detection |
| **parseMilestonesDoc edge cases** | Handles missing MVP marker, single milestone, empty doc |
| **parseArchComponentList** | Extracts component list from milestone section of ARCH.md |
| **parseArchComponentList missing section** | Returns empty array if no "Components Requiring Detailed Design" section |
| **installSkills** | Copies all 4 skill files into workspace |
| **installSkills idempotent** | Running twice doesn't duplicate or error |
| **PlanningEngine.runSkill vision** | Spawns agent with vision skill content, verifies VISION.md created |
| **PlanningEngine.runSkill milestones** | Spawns agent with milestone skill, verifies MILESTONES.md created |
| **PlanningEngine.runPipeline sequence** | Skills run in correct order: vision → milestones → architecture → design |
| **PlanningEngine.runPipeline creates DB records** | After pipeline, milestones and tasks exist in DB |
| **PlanningEngine.runPipeline progress events** | Correct events emitted at each stage |
| **PlanningEngine.runPipeline error handling** | Agent failure at any stage emits error event, pipeline stops |
| **PlanningEngine.runPipeline collaboration pause** | In operator profile, pauses after vision and milestones |
| **PlanningEngine.runSkill re-run** | Can re-run architecture skill for a specific milestone |
| **buildSkillPrompt** | Includes skill content, project prompt, and context instructions |
| **Project creation integration** | POST /api/projects → POST /api/projects/:id/plan produces full workspace |
| **Backwards compat** | Old /generate endpoint still works |

## Smoke Test

1. Create a new project with prompt: "Freelancer invoicing — create invoices, send to clients, accept Stripe payments, track revenue"
2. Observe planning progress — vision skill runs, produces VISION.md
3. Check VISION.md has a focused hypothesis and success metric (not a generic feature list)
4. Milestone skill runs, produces MILESTONES.md with 3-5 ordered milestones and MVP boundary
5. Architecture skill runs for M1, appends to ARCH.md with component list
6. Design skill runs for each component, creates files under `docs/detailed_design/`
7. Task extraction populates delivery schema — verify via `GET /api/projects/:id/milestones`
8. Verify milestones, phases (from directory names), and tasks (from checkbox items) are all present
9. Verify each task has `source_doc` pointing to the correct design doc
10. Verify phases have `exit_criteria` extracted from design docs
11. Compare output quality against the old monolithic doc generator — should be more structured and actionable
12. Test re-running architecture skill for M2 — verify ARCH.md is extended, not replaced
13. Test collaboration pause — in operator profile, verify pipeline pauses after vision and milestones
