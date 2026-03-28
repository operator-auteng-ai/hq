# Phase 5 — Orchestrator Chat (Detailed Design)

## Problem

Users interact with the orchestrator only through UI buttons (start/approve/reject/skip on phases and milestones). This works for simple flows but becomes limiting when:

- A task fails and the user wants to understand why before deciding to retry or skip
- The user wants to ask about project status without navigating through multiple tabs
- The user wants to issue compound commands ("start the next milestone and skip task 3")
- The user wants to re-plan ("re-run the architecture skill for M2 with different constraints")
- The user needs to make decisions that don't map to a single button (e.g., "this milestone is taking too long, split it into two")

## Solution: Conversational Orchestrator Interface

Add a chat panel to the project page that lets users converse with the orchestrator. The chat is backed by Claude API calls with the project's full context injected as a system prompt. The assistant can answer questions about project state and propose orchestrator actions that require user confirmation before execution.

This is a **meta-layer** — the chat controls the decomposition/delivery pipeline, it doesn't write code. It's distinct from agent output (which shows what agents are doing) and from the planning engine (which runs skills).

## Data Model

### New Table: `chat_messages`

```typescript
export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  actionProposed: text("action_proposed"),
  actionExecuted: integer("action_executed").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})
```

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | text | PK | UUID |
| `project_id` | text | FK → projects, NOT NULL, CASCADE | Parent project |
| `role` | text | NOT NULL | `user` · `assistant` |
| `content` | text | NOT NULL | Message text (markdown) |
| `action_proposed` | text | nullable | JSON of proposed orchestrator action, if any |
| `action_executed` | integer | NOT NULL, default 0 | 1 if the proposed action was confirmed and executed |
| `created_at` | text | NOT NULL | ISO 8601 |

No status transitions — messages are append-only. Actions are proposed inline in assistant messages and confirmed/rejected by subsequent user messages.

## Context Builder

### File: `lib/services/context-builder.ts`

Assembles the project's current state into a system prompt for the chat. The goal is to give Claude enough context to answer questions accurately and propose valid actions, without overwhelming the context window.

```typescript
export interface ProjectContext {
  systemPrompt: string
  tokenEstimate: number
}

export function buildProjectContext(projectId: string): ProjectContext
```

**System prompt structure:**

```
You are the orchestrator for project "<name>".

## Project Vision
<hypothesis from VISION.md or projects.vision_hypothesis>
Success metric: <from VISION.md or projects.success_metric>

## Current Status
Project status: <status>
Current milestone: <name> (<status>)
Current phase: <name> (<status>)

## Milestone Progress
M1: Core Invoicing — completed
M2: Payments — active
  Phase: Stripe Integration — active
    ✓ Create payments table (completed)
    ● Stripe adapter (in_progress, agent a1 running)
    ○ Webhook handler (pending)
    ✗ Ledger service (failed — agent exited with code 1)
  Phase: Payment UI — pending
M3: Dashboard — pending ← MVP

## Recent Failures
Task "Ledger service" (phase "Stripe Integration", milestone "Payments"):
  Agent a2 failed at 2026-03-22T10:15:00Z
  Last output (truncated): "Error: Cannot find module 'stripe'..."

## Available Actions
You can propose these actions (user must confirm before execution):
- startTask <taskId> — start a pending task
- retryTask <taskId> — retry a failed task
- skipTask <taskId> — skip a pending or failed task
- approvePhase <phaseId> — approve a phase (from reviewing or review_failed)
- rejectPhase <phaseId> — reject a phase and reset tasks
- approveMilestone <milestoneId> — approve a completed milestone
- startPhase <phaseId> — start all pending tasks in a phase
- runSkill <skillName> [milestoneName] — re-run a planning skill

When proposing an action, output it on a line by itself in this format:
ACTION: <actionName> <entityId>

Only propose actions when the user requests them or when they're clearly implied.
Answer questions directly from the context above.
If you don't have enough information to answer, say so.
```

**Context budget:**
- Full milestone/phase/task tree with statuses: always included
- Recent failures (last 3): always included, with truncated agent output (last 500 chars)
- Workspace file listing (`docs/` directory): included if < 50 files
- Full VISION.md content: included if < 500 words
- Recent chat history: last 20 messages included for conversational continuity

**Token estimation**: Count system prompt characters / 4 as rough token estimate. If > 8000 tokens, trim workspace file listing and agent output excerpts first.

## Action Extraction

### File: `lib/services/action-extractor.ts`

Parses assistant messages for proposed actions and maps them to orchestrator/delivery tracker operations.

```typescript
export interface ProposedAction {
  action: string
  entityId: string
  description: string
}

export function extractActions(assistantMessage: string): ProposedAction[]
```

**Extraction logic:**
1. Scan for lines matching `ACTION: <actionName> <entityId>`
2. Validate `actionName` is in the allowed set
3. Return structured `ProposedAction` objects

**Allowed actions and their execution:**

| Action | Entity | Executes |
|--------|--------|----------|
| `startTask` | taskId | `DeliveryTracker.updateTaskStatus(id, "in_progress")` + cascade |
| `retryTask` | taskId | `DeliveryTracker.updateTaskStatus(id, "in_progress")` |
| `skipTask` | taskId | `DeliveryTracker.updateTaskStatus(id, "skipped")` |
| `approvePhase` | phaseId | Force-approve via milestones PATCH endpoint |
| `rejectPhase` | phaseId | `DeliveryTracker.resetPhaseForRework(id)` |
| `approveMilestone` | milestoneId | `DeliveryTracker.updateMilestoneStatus(id, "completed")` |
| `startPhase` | phaseId | Activate phase + start first pending task |
| `runSkill` | skillName | `PlanningEngine.runSkill(projectId, skillName, config, context)` |

Actions are never auto-executed. The UI shows a confirmation prompt with the action description. The user clicks "Confirm" or "Cancel". On confirm, the action is executed and the `action_executed` flag is set on the chat message.

## API Route

### `POST /api/projects/:id/chat`

Streaming chat endpoint. Accepts a user message, builds context, calls Claude API, streams the response, and persists both messages.

```typescript
// Request
{
  "message": "Why did the ledger service task fail?"
}

// Response: SSE stream
event: token
data: {"content": "The ledger"}

event: token
data: {"content": " service task"}

// ... more tokens ...

event: action
data: {"action": "retryTask", "entityId": "t-123", "description": "Retry the Ledger service task"}

event: done
data: {"messageId": "msg-456"}
```

**Implementation:**

```typescript
export async function POST(request: NextRequest, { params }: RouteParams) {
  // 1. Validate project exists
  // 2. Parse request body (message string)
  // 3. Persist user message to chat_messages
  // 4. Build project context via context-builder
  // 5. Load recent chat history (last 20 messages)
  // 6. Call Anthropic API with:
  //    - system: project context
  //    - messages: chat history + new user message
  //    - model: from project config or default sonnet
  //    - stream: true
  // 7. Stream response tokens via SSE
  // 8. On completion: extract actions, persist assistant message
  // 9. Return action events if any
}
```

### `GET /api/projects/:id/chat`

Returns chat history for a project.

```json
{
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "What's the current status?",
      "createdAt": "2026-03-22T..."
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "content": "The project is currently...",
      "actionProposed": null,
      "actionExecuted": 0,
      "createdAt": "2026-03-22T..."
    }
  ]
}
```

### `POST /api/projects/:id/chat/confirm`

Confirms and executes a proposed action from a chat message.

```typescript
// Request
{
  "messageId": "msg-456",
  "confirm": true
}

// Response
{
  "executed": true,
  "result": { "taskId": "t-123", "status": "in_progress" }
}
```

## UI Component

### `components/orchestrator-chat.tsx`

Chat panel component for the project detail page. Molecule level in the component registry under "Project" sublabel.

```typescript
export interface OrchestratorChatProps {
  projectId: string
}
```

**Layout:**
- Fixed-height panel (400px) at the bottom of the project page, or toggleable sidebar
- Message list with scroll, user messages right-aligned, assistant messages left-aligned
- Input field at bottom with send button
- Action confirmation cards inline in the message flow

**Design tokens:**
- User messages: `bg-primary text-primary-foreground rounded-lg p-3`
- Assistant messages: `bg-muted rounded-lg p-3`
- Action cards: `bg-card border-border rounded-lg p-3` with confirm/cancel buttons
- Input: standard shadcn `Input` + `Button`
- Message text: `text-sm`, timestamps: `text-xs text-muted-foreground`
- Panel: `border-t border-border` separator from content above
- Scroll area: `max-h-[400px] overflow-y-auto`

**Typography:**
- Messages: `text-sm font-normal`
- Action descriptions: `text-sm font-medium`
- Timestamps: `text-xs text-muted-foreground`

**Streaming:**
- Uses `fetch` with streaming body (same pattern as project-form.tsx)
- Tokens appended to the current assistant message as they arrive
- Action events rendered as confirmation cards after the message completes

**Action confirmation card:**
```
┌─────────────────────────────────────────────┐
│ ⚡ Proposed Action                          │
│                                             │
│ Retry the Ledger service task               │
│                                             │
│              [ Cancel ]  [ Confirm ]        │
└─────────────────────────────────────────────┘
```

Uses `bg-card`, `rounded-lg`, `border border-border`, `p-3`. Confirm button uses `variant="default"`, cancel uses `variant="outline"`. Both `text-sm`.

## Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/services/context-builder.ts` | Build project context system prompt |
| `lib/services/context-builder.test.ts` | Tests for context building |
| `lib/services/action-extractor.ts` | Parse assistant messages for proposed actions |
| `lib/services/action-extractor.test.ts` | Tests for action extraction |
| `app/api/projects/[id]/chat/route.ts` | POST (send message, stream response), GET (history) |
| `app/api/projects/[id]/chat/confirm/route.ts` | POST (confirm/reject proposed action) |
| `components/orchestrator-chat.tsx` | Chat panel UI component |

### Modified Files

| File | Change |
|------|--------|
| `lib/db/schema.ts` | Add `chatMessages` table |
| `app/projects/[id]/page.tsx` | Add chat panel to project detail page |
| `components/registry/entries.ts` | Add `OrchestratorChat` entry as molecule |

### Not Modified

| File | Why |
|------|-----|
| `lib/services/delivery-tracker.ts` | Chat executes actions through the existing delivery tracker — no changes needed |
| `lib/services/planning-engine.ts` | Chat can trigger `runSkill` through the existing planning engine — no changes needed |
| `lib/services/orchestrator.ts` | Chat actions go through delivery tracker directly, not the old orchestrator |

## Migration

Additive — new `chat_messages` table only. Run `npx drizzle-kit generate` after adding the table to schema.ts.

## Test Plan

| Test | What it verifies |
|------|-----------------|
| **buildProjectContext — basic** | Produces system prompt with project name, status, milestone tree |
| **buildProjectContext — with failures** | Includes recent failure details with truncated agent output |
| **buildProjectContext — empty project** | Handles project with no milestones gracefully |
| **buildProjectContext — token budget** | Trims workspace listing and agent output when context is too large |
| **extractActions — single action** | Parses `ACTION: retryTask t-123` correctly |
| **extractActions — multiple actions** | Extracts all ACTION lines from a message |
| **extractActions — no actions** | Returns empty array for messages without ACTION lines |
| **extractActions — invalid action** | Ignores unrecognized action names |
| **extractActions — malformed line** | Ignores ACTION lines missing entityId |
| **Chat message persistence** | POST creates user + assistant messages in DB |
| **Chat history** | GET returns messages ordered by created_at |
| **Action confirmation** | POST confirm executes the proposed action and sets action_executed flag |
| **Action rejection** | POST confirm with confirm=false does not execute |
| **Context includes chat history** | System prompt includes last 20 messages |

## Smoke Test

1. Navigate to a project with milestones and tasks (created via planning pipeline or manually via API)
2. Open the chat panel on the project page
3. Ask "What's the current status?" — verify the response accurately describes milestones, phases, and task statuses
4. Ask "Why did task X fail?" — verify the response includes the agent's error output
5. Say "Retry that task" — verify an action confirmation card appears
6. Click "Confirm" — verify the task status changes to `in_progress`
7. Ask "Skip the next pending task" — verify correct task identified and action proposed
8. Click "Cancel" — verify no status change
9. Say "Start milestone M2" — verify the correct milestone and its first phase are identified
10. Verify chat history persists across page reloads (GET /chat returns previous messages)
11. Verify streaming — assistant response appears token by token, not all at once
