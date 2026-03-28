# Phase 8 — Project Cockpit UI (Detailed Design)

## Problem

The current project page has five problems:

1. **Chat is hidden in a tab** — the user can't see docs and chat simultaneously. Every interaction requires switching tabs.
2. **Project creation stays on the form page** — the user watches "Planning..." on the create form instead of landing on the project page where they can see artifacts as they're created.
3. **Pipeline feedback is disconnected** — skill progress appears as SSE events on the form, not in the chat timeline where the user can respond to it.
4. **No artifact navigation** — the user can't move between decomposition levels (vision → milestones → architecture → design → tasks). Everything is in flat tabs.
5. **Sidebar overflow** — when the left nav is open, the right side of the page is pushed off-screen.

## Solution: Three-Column Cockpit Layout

```
┌──────────┬───────────────────────────────────────┬─────────────────────┐
│          │ ◉ Vision → ◉ Milestones → ● Arch →   │                     │
│  Sidebar │ ○ Design → ○ Tasks                    │  Chat Panel         │
│  (nav)   │                                       │  (always visible)   │
│  w-64    │ ┌───────────────────────────────────┐ │                     │
│  or      │ │                                   │ │ ⚙ Vision running..│
│  collapsed│ │  Active Artifact                  │ │ ✓ VISION.md done  │
│          │ │  (rendered markdown + mermaid)     │ │                     │
│          │ │                                   │ │ You: "Make the      │
│          │ │                                   │ │ hypothesis sharper" │
│          │ │                                   │ │                     │
│          │ │                                   │ │ Orch: "Updated..."  │
│          │ │                                   │ │                     │
│          │ │                                   │ │ ⚙ Milestones       │
│          │ │                                   │ │    running...       │
│          │ └───────────────────────────────────┘ │                     │
│          │                                       │ [input field]       │
└──────────┴───────────────────────────────────────┴─────────────────────┘
```

Three columns:
- **Left**: Existing sidebar nav (`w-64`, collapsible). No changes needed to the sidebar itself — only the content layout.
- **Center**: Pipeline nav bar + active artifact. Fills remaining space (`flex-1`).
- **Right**: Chat panel. Fixed width (`w-[350px]`), always visible, not collapsible.

## Task 8.1 — Three-Column Layout

### File: `app/layout.tsx`

No change to the root layout — it already uses `SidebarProvider` + `SidebarInset`. The project page itself manages the center + right columns.

### File: `app/projects/[id]/page.tsx`

Replace the current tabbed layout with a two-panel layout inside the `SidebarInset`:

```tsx
<div className="flex h-[calc(100vh-3rem)] overflow-hidden">
  {/* Center: pipeline nav + artifact */}
  <div className="flex-1 flex flex-col overflow-hidden">
    <PipelineNav level={activeLevel} onSelect={setActiveLevel} project={project} />
    <div className="flex-1 overflow-auto p-6">
      <ArtifactViewer level={activeLevel} project={project} />
    </div>
  </div>

  {/* Right: chat panel */}
  <div className="w-[350px] shrink-0 border-l border-border flex flex-col">
    <ProjectChat projectId={id} />
  </div>
</div>
```

`h-[calc(100vh-3rem)]` accounts for the header bar (h-12 = 3rem). `overflow-hidden` on the container prevents the sidebar overflow bug — the center panel can't exceed the available space.

### Sidebar Overflow Fix

The bug: when the sidebar opens, the main content area doesn't shrink — it stays at its natural width, causing horizontal overflow.

The fix is already in the layout structure — `SidebarInset` uses `flex-1` which should shrink when the sidebar takes space. If it doesn't, add `min-w-0` to the `SidebarInset` to allow flex shrinking below content width:

```tsx
<SidebarInset className="min-w-0">
```

This is a one-line fix in `app/layout.tsx`.

## Task 8.2 — Pipeline Progress Bar

### Component: `components/pipeline-nav.tsx`

Horizontal bar showing the 5 decomposition levels. Acts as both progress indicator and navigation.

```typescript
export type PipelineLevel = "vision" | "milestones" | "architecture" | "design" | "tasks"

export interface PipelineNavProps {
  level: PipelineLevel
  onSelect: (level: PipelineLevel) => void
  projectStatus: string
  milestoneCount?: number
  completedSkills?: PipelineLevel[]
}
```

**Visual states per level:**
- **Completed** (`completedSkills` includes it): filled circle, `text-status-completed`, clickable
- **Active** (`level` equals it): filled circle with ring, `text-primary`, selected
- **Running** (skill agent currently executing): pulsing circle, `text-status-running`
- **Pending**: empty circle, `text-muted-foreground`, not clickable

**Layout:**
```
◉ Vision  ─────  ◉ Milestones  ─────  ● Architecture  ─────  ○ Design  ─────  ○ Tasks
```

- Circles: `h-3 w-3 rounded-full`
- Connectors: `h-px flex-1 bg-border` (completed sections: `bg-status-completed`)
- Labels: `text-xs font-medium`
- Container: `flex items-center gap-2 px-6 py-3 border-b border-border bg-background`
- Active level label: `font-semibold text-foreground`
- Pending label: `text-muted-foreground`

**Determining state**: The pipeline nav reads from:
1. Project status (`planning` = skills are running, `building` = planning done)
2. Which workspace files exist (VISION.md → vision complete, MILESTONES.md → milestones complete, etc.)
3. Whether milestones/tasks exist in the delivery tracker (tasks level available)

The project page fetches this state and passes it as props. No new API endpoint needed — derive from project status + milestones API response.

## Task 8.3 — Center Content Renderer

### Component: `components/artifact-viewer.tsx`

Renders the active artifact based on the selected pipeline level.

```typescript
export interface ArtifactViewerProps {
  level: PipelineLevel
  projectId: string
  workspacePath: string | null
  selectedMilestone?: string
  selectedComponent?: string
}
```

**Content by level:**

| Level | What to render | Data source |
|-------|---------------|-------------|
| `vision` | Rendered VISION.md | `GET /api/projects/:id/docs` → vision field |
| `milestones` | Rendered MILESTONES.md | `GET /api/projects/:id/docs` → milestones field (new) |
| `architecture` | Milestone sub-nav + rendered arch delta | New endpoint or docs API extension |
| `design` | Phase → component sub-nav + rendered design doc | Docs API extension |
| `tasks` | Milestone tree with inline controls | `GET /api/projects/:id/milestones` |

**Markdown rendering**: Use a markdown renderer that supports mermaid diagrams. Options:
- `react-markdown` + `remark-gfm` for markdown
- `mermaid` library for diagram rendering (lazy-loaded)
- Or: render as `<pre>` initially, add proper rendering in a follow-up

For v0, rendered markdown with mermaid is ideal but `<pre>` with syntax highlighting is acceptable as a first pass. The key UX improvement is the navigation, not the rendering quality.

### Docs API Extension

The existing `GET /api/projects/:id/docs` returns the 5 original doc files. Extend it to also return:
- `milestones`: content of `docs/MILESTONES.md` (if exists)
- `archDeltas`: list of files under `docs/milestones/*/ARCH.md`
- `designDocs`: list of files under `docs/detailed_design/**/*.md`

Each returns `{ path: string, content: string }[]` so the UI can render any doc on demand.

## Task 8.4 — Chat Panel (Always Visible)

### Component: Refactor `components/orchestrator-chat.tsx`

Move from a tab-contained component to a permanent right panel. Changes:

1. **Remove the `border-t`** at the top (it's now bordered by the column's `border-l`)
2. **Full height**: `flex flex-col h-full` — message list fills available space, input fixed at bottom
3. **System messages**: New message type for pipeline events

### System Messages

Add a `system` role to the chat display (not stored in DB — these are ephemeral pipeline events):

```typescript
interface SystemMessage {
  id: string
  role: "system"
  content: string
  icon: "running" | "completed" | "failed" | "info"
  timestamp: string
}
```

System messages are rendered differently:
- No chat bubble — just a single line with icon
- `text-xs text-muted-foreground` for text
- Icon prefix: ⚙ (running), ✓ (completed), ✗ (failed), ℹ (info)
- `py-1` vertical spacing (tighter than user/assistant messages)

```tsx
<div className="flex items-center gap-2 py-1 px-3">
  <StatusIcon status={msg.icon} className="h-3 w-3 shrink-0" />
  <span className="text-xs text-muted-foreground">{msg.content}</span>
  <span className="text-xs text-muted-foreground/50 ml-auto">
    {formatTime(msg.timestamp)}
  </span>
</div>
```

### Pipeline Events → System Messages

The planning pipeline (via `/api/projects/:id/plan`) emits SSE events. Instead of showing them on the form page, the project page's chat panel consumes them:

1. On project page load, if project status is `planning`, connect to the plan SSE endpoint
2. Convert each `progress` event to a system message in the chat timeline
3. When the pipeline completes, show a system message and refresh the pipeline nav + artifact viewer

## Task 8.5 — Project Creation Redirect

### File: `components/project-form.tsx`

Change the flow:
1. POST `/api/projects` → creates project + workspace → returns project with ID
2. **Immediately redirect** to `/projects/:id` (don't call `/plan` from the form)
3. The project page detects `status: "draft"` and auto-triggers the planning pipeline
4. Pipeline progress appears as system messages in the chat panel

### File: `app/projects/[id]/page.tsx`

On load, if `project.status === "draft"`:
1. Call `POST /api/projects/:id/plan` with default config
2. Show "Starting planning pipeline..." as the first system message in chat
3. Consume SSE events → system messages
4. On completion, refresh project data and update pipeline nav

This separates concerns: the form creates the project, the project page runs the pipeline.

## Task 8.6 — Milestone/Phase/Task Tree

### Component: `components/milestone-tree.tsx`

The "Tasks" level in the pipeline shows the delivery tree. This is an enhanced version of the current milestones tab content:

```typescript
export interface MilestoneTreeProps {
  projectId: string
  milestones: MilestoneTree
  onAction: (action: string, entityId: string) => void
}
```

**Features:**
- Collapsible milestones (click to expand/collapse phases)
- Collapsible phases (click to expand/collapse tasks)
- Status icons per entity (from TAXONOMY status tokens)
- Completion bar per milestone (tasks completed / total)
- Inline controls on tasks: Start (pending), Retry (failed), Skip (pending/failed)
- Inline controls on phases: Approve (reviewing), Reject (reviewing/review_failed)
- MVP boundary marker on the boundary milestone

**Layout:**
```
▼ ◉ M1: Core Invoicing                          [====----] 4/6
    ▼ ✓ Data Model & API                         completed
        ✓ Create invoices table                   completed
        ✓ CRUD endpoints                          completed
    ▼ ● Stripe Integration                       active
        ✓ Stripe adapter                          completed
        ● Webhook handler                         in_progress  [View Output]
        ○ Ledger service                          pending      [Start]
    ▶ ○ Payment UI                               pending

▶ ○ M2: Dashboard                               pending  ← MVP
```

**Design tokens:**
- Tree indentation: `ml-4` per level
- Status icons: `h-3 w-3` circles using `--status-*` tokens
- Expand/collapse: `ChevronRight` / `ChevronDown` from lucide-react
- Completion bar: `h-1 rounded-full bg-muted` container, `bg-status-completed` fill
- Controls: `Button` size `sm` variant `ghost`

## Task 8.7 — Architecture & Design Sub-Navigation

When the user clicks "Architecture" in the pipeline nav, show a sub-nav for milestone selection:

```
◉ Vision → ◉ Milestones → ● Architecture → ○ Design → ○ Tasks
                            ├── M1: Core Invoicing (delta)
                            ├── M2: Payments (delta)
                            └── Canonical: ARCH.md
```

Clicking a milestone shows its arch delta doc. Clicking "Canonical" shows the main ARCH.md.

Similarly for "Design":
```
○ Design
├── Phase: Data Model & API
│   ├── invoice-schema.md
│   └── crud-endpoints.md
└── Phase: Stripe Integration
    ├── stripe-adapter.md
    └── webhook-handler.md
```

These sub-navs appear as a secondary bar below the pipeline nav, or as a sidebar within the center column. Use `text-sm` links with `bg-muted` hover states.

## Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `components/pipeline-nav.tsx` | Horizontal pipeline level navigation |
| `components/artifact-viewer.tsx` | Renders active artifact (markdown + mermaid) |
| `components/milestone-tree.tsx` | Collapsible delivery tree with inline controls |
| `components/system-message.tsx` | Pipeline event display in chat timeline |

### Modified Files

| File | Change |
|------|--------|
| `app/layout.tsx` | Add `min-w-0` to `SidebarInset` to fix overflow |
| `app/projects/[id]/page.tsx` | Replace tabbed layout with three-column cockpit. Auto-trigger pipeline on draft projects |
| `components/orchestrator-chat.tsx` | Refactor to permanent panel. Add system message support. Consume pipeline SSE |
| `components/project-form.tsx` | Remove pipeline SSE handling. Redirect immediately after project creation |
| `app/api/projects/[id]/docs/route.ts` | Extend to return milestone arch deltas and design docs |
| `components/registry/entries.ts` | Add PipelineNav, ArtifactViewer, MilestoneTree entries |

### Not Modified

| File | Why |
|------|-----|
| `lib/services/planning-engine.ts` | Pipeline execution unchanged |
| `lib/services/orchestrator.ts` | Task execution unchanged |
| `lib/services/delivery-tracker.ts` | State machine unchanged |
| `app/api/projects/[id]/plan/route.ts` | SSE endpoint unchanged — consumed from project page instead of form |

## Design Token Usage

| Element | Token / Class |
|---------|--------------|
| Pipeline circles (completed) | `bg-status-completed` |
| Pipeline circles (active) | `bg-primary ring-2 ring-primary/30` |
| Pipeline circles (running) | `bg-status-running animate-pulse` |
| Pipeline circles (pending) | `bg-muted-foreground/30` |
| Pipeline connectors | `bg-border` (pending), `bg-status-completed` (done) |
| Pipeline labels | `text-xs font-medium` |
| Chat panel border | `border-l border-border` |
| System messages | `text-xs text-muted-foreground` |
| System message icons | `h-3 w-3`, color from `--status-*` tokens |
| Milestone tree indent | `ml-4` per level |
| Task controls | `Button` size `sm` variant `ghost` |
| Completion bar | `h-1 rounded-full bg-muted` / `bg-status-completed` |
| Artifact content | `prose` or `text-sm leading-relaxed` for markdown |
| Sub-nav links | `text-sm text-muted-foreground hover:text-foreground` |

## Strategy Game Inspiration

The cockpit borrows three patterns from strategy games:

1. **Tech tree navigation** — The pipeline bar is a horizontal tech tree. Completed nodes glow, active nodes pulse, locked nodes are greyed. You see the full path and know exactly where you are.

2. **Advisor panel** — The always-visible chat is the advisor. It proactively tells you what's happening (system messages) and responds when you ask (user messages). You never have to go looking for information.

3. **Map view** — The center content is the map. It shows the artifact you're currently focused on — the terrain you're shaping. Click a different node in the tech tree and the map zooms to that artifact.

## Test Plan

| Test | What it verifies |
|------|-----------------|
| **Layout: three columns render** | Sidebar + center + chat panel all visible, no overflow |
| **Layout: sidebar toggle doesn't overflow** | Opening/closing sidebar keeps content within viewport |
| **Pipeline nav: shows correct states** | Completed/active/pending levels render with correct icons |
| **Pipeline nav: clicking level changes content** | Click "Vision" → shows VISION.md, click "Tasks" → shows milestone tree |
| **Artifact viewer: renders markdown** | VISION.md content displays in center panel |
| **Chat: system messages display** | Pipeline events appear with icon prefix, distinct from user messages |
| **Chat: always visible** | Chat panel present without clicking a tab |
| **Project creation: redirects immediately** | Form submits → redirect to project page (no waiting on form) |
| **Pipeline auto-starts on draft** | Project page with draft status triggers planning pipeline |
| **Milestone tree: renders with controls** | Milestones, phases, tasks shown with status badges and action buttons |
| **Milestone tree: inline actions work** | Start/skip/retry buttons trigger API calls |

## Smoke Test

1. Create a new project → verify immediate redirect to project page (not stuck on form)
2. On project page: verify three-column layout (sidebar, center, chat on right)
3. Verify chat panel shows "Starting planning pipeline..." system message
4. Verify pipeline progress bar shows Vision as active/running
5. Toggle sidebar open/closed → verify no horizontal overflow
6. When vision completes: verify VISION.md appears in center panel, pipeline bar advances
7. Click "Vision" in pipeline bar → center shows VISION.md
8. Click "Tasks" in pipeline bar → center shows milestone tree (or "pending" if not ready)
9. Type in chat → verify response streams in the right panel while center content stays visible
10. When milestones exist: verify milestone tree shows collapsible structure with status icons
