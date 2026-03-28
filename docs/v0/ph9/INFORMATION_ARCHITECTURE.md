# Information Architecture — AutEng HQ

## Principles

1. **Project is the unit of work.** Everything the user cares about lives under a project. The app should make it effortless to enter a project and stay oriented within it.
2. **Global views are for triage.** Dashboard, global agents, global deploys exist to answer "what needs my attention across everything?" — then the user dives into a project.
3. **Context should never be ambiguous.** The user should always know which project they're in, or that they're in the global view.
4. **Refresh-proof.** Every view reconstructs fully from the database. No transient-only state for anything the user would notice losing.

---

## Site Map

```
/                           Global Dashboard
/projects                   Global Projects List
/projects/new               New Project Form
/projects/:id               Project Cockpit (default: last active level)
/projects/:id/agents        Project Agents
/projects/:id/deploys       Project Deploys
/agents                     Global Agents (cross-project)
/deploys                    Global Deploys (cross-project)
/settings                   Settings (API keys, preferences)
/design-system              Design System (dev-only)
```

---

## Navigation Modes

The sidebar has two modes: **global** and **project-scoped**. The mode switches based on whether the user is inside a project route (`/projects/:id/*`).

### Global Mode

Shown on `/`, `/projects`, `/agents`, `/deploys`, `/settings`.

```
┌──────────────────────┐
│  AutEng HQ           │
├──────────────────────┤
│  Dashboard        /  │
│  Projects   /projects│
│  Agents     /agents  │
│  Deploys    /deploys │
├──────────────────────┤
│  Settings  /settings │
│  Theme toggle        │
└──────────────────────┘
```

### Project-Scoped Mode

Shown on `/projects/:id`, `/projects/:id/agents`, `/projects/:id/deploys`.

```
┌──────────────────────┐
│  ← All Projects      │
│  ┌────────────────┐  │
│  │ Project Name   │  │
│  │ ● status       │  │
│  └────────────────┘  │
├──────────────────────┤
│  Cockpit    /p/:id   │
│  Agents     /p/:id/a │
│  Deploys    /p/:id/d │
├──────────────────────┤
│  Settings  /settings │
│  Theme toggle        │
└──────────────────────┘
```

- **"All Projects" back link** returns to `/projects` and switches sidebar back to global mode.
- **Project header** shows project name and status badge. Always visible while in project scope.
- **Settings and theme** remain in both modes (they're app-level, not project-level).

---

## Pages

### Global Dashboard (`/`)

**Purpose:** "What needs my attention?" — a launchpad, not a workspace.

```
┌─────────────────────────────────────────┐
│ Dashboard                  [New Project] │
├─────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌─────────┐│
│ │ N Projects│ │ N Active  │ │N Agents ││
│ └───────────┘ └───────────┘ └─────────┘│
├─────────────────────────────────────────┤
│ Recent Projects                         │
│ ┌─────────────────────────────────────┐ │
│ │ Project A    ● planning    Mar 27  │ │
│ │ Project B    ● building    Mar 25  │ │
│ │ Project C    ● draft       Mar 24  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Actions:** Create new project, click project to enter cockpit, click stat cards to jump to filtered views.

---

### Global Projects List (`/projects`)

**Purpose:** Browse and filter all projects.

```
┌─────────────────────────────────────────────┐
│ Projects                       [New Project] │
├─────────────────────────────────────────────┤
│ All | Draft | Planning | Building | Deployed │
├─────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│ │Project A │ │Project B │ │Project C │     │
│ │● planning│ │● building│ │● draft   │     │
│ │ prompt…  │ │ prompt…  │ │ prompt…  │     │
│ └──────────┘ └──────────┘ └──────────┘     │
└─────────────────────────────────────────────┘
```

**Actions:** Filter by status tab, create new project, click card to enter project cockpit.

---

### New Project Form (`/projects/new`)

**Purpose:** Capture the user's product vision and create a project.

```
┌─────────────────────────────────────┐
│         Create New Project          │
├─────────────────────────────────────┤
│ Project Name                        │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Vision Prompt                       │
│ ┌─────────────────────────────────┐ │
│ │ Describe what you want to       │ │
│ │ build…                          │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Model  [Sonnet v]                   │
│                                     │
│              [Create Project]       │
└─────────────────────────────────────┘
```

**Actions:** Fill form, submit. On success → redirect to `/projects/:id` (cockpit). Planning pipeline starts automatically.

---

### Project Cockpit (`/projects/:id`)

**Purpose:** The primary workspace. Monitor planning pipeline, view artifacts, chat with orchestrator, manage tasks.

```
┌────────────────────────────────────────────────────────────────┐
│  Project Name  ● status   ~/workspace/path       [Archive]    │
├────────────────────────────────────────────────────────────────┤
│  ◉ Vision → ◉ Milestones → ◉ Architecture → ○ Design → ○ Tasks│
├───────────────────────────────────────┬────────────────────────┤
│                                       │ Orchestrator Chat      │
│                                       │                        │
│  Artifact Viewer                      │ ┌ system ─────────┐   │
│                                       │ │ Vision complete  │   │
│  (content changes based on            │ └──────────────────┘   │
│   selected pipeline level)            │                        │
│                                       │ ┌ user ───────────┐   │
│  - Vision: rendered markdown          │ │ What's next?     │   │
│  - Milestones: milestone tree         │ └──────────────────┘   │
│  - Architecture: arch docs + deltas   │                        │
│  - Design: design docs per component  │ ┌ assistant ──────┐   │
│  - Tasks: task tree with controls     │ │ Milestones are…  │   │
│                                       │ └──────────────────┘   │
│                                       │                        │
│  ┌─ Review Banner (conditional) ────┐ │ ┌──────────────────┐  │
│  │ Vision ready for review          │ │ │ Type a message…  │  │
│  │            [Continue Pipeline]   │ │ └──────────────────┘  │
│  └──────────────────────────────────┘ │                        │
└───────────────────────────────────────┴────────────────────────┘
```

**Pipeline nav states:** Completed (filled), running (pulsing), active/selected (ring), not started (faint). Clicking a completed/active level switches the artifact viewer.

**Review banner:** Appears when a pipeline stage completes and awaits human approval. "Continue Pipeline" advances to the next skill.

**Chat panel:** Always visible. Streams system messages from the pipeline. User can ask questions or issue commands. Proposed actions require confirmation.

**Actions:** Navigate pipeline levels, continue pipeline at gates, interact with tasks (start, skip, retry), chat with orchestrator, archive project.

---

### Project Agents (`/projects/:id/agents`)

**Purpose:** Monitor and control agents for this project.

```
┌─────────────────────────────────────────────┐
│ Agents — Project Name                        │
├─────────────────────────────────────────────┤
│ Running | Completed | Failed | All           │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ Agent #12  ● running   vision skill     │ │
│ │ Model: sonnet  Turns: 5  Cost: $0.12    │ │
│ │                        [Cancel] [View]  │ │
│ ├─────────────────────────────────────────┤ │
│ │ Agent #11  ● completed  milestones      │ │
│ │ Model: sonnet  Turns: 8  Cost: $0.34    │ │
│ │                        [Resume] [View]  │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Actions:** Filter by status, cancel running agents, resume failed agents, view agent output.

---

### Project Deploys (`/projects/:id/deploys`)

**Purpose:** Deploy history and status for this project. (Not yet implemented — placeholder.)

---

### Global Agents (`/agents`)

**Purpose:** Cross-project agent monitoring. "What's running right now across everything?"

Same layout as project agents but with a **project name column** on each card and no project filter implied.

---

### Global Deploys (`/deploys`)

**Purpose:** Cross-project deploy overview. (Not yet implemented — placeholder.)

---

### Settings (`/settings`)

**Purpose:** App-level configuration.

```
┌─────────────────────────────────────┐
│ Settings                            │
├─────────────────────────────────────┤
│ API Keys                            │
│ ┌─────────────────────────────────┐ │
│ │ Anthropic API Key               │ │
│ │ [••••••••••••••••••] [Show]     │ │
│ │ ● Configured  ● Encrypted      │ │
│ │         [Save Key] [Remove]     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Actions:** Save/remove API key, toggle visibility.

---

## User Flow: Create a Project

```
                    ┌─────────┐
                    │  Start  │
                    └────┬────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Dashboard or        │
              │ Projects List       │
              │ Click [New Project] │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ /projects/new       │
              │ Enter name + vision │
              │ prompt + model      │
              │ Click [Create]      │
              └──────────┬──────────┘
                         │
                    POST /api/projects
                    project created (draft)
                         │
                         ▼
              ┌─────────────────────┐
              │ Redirect to         │
              │ /projects/:id       │
              │ (Project Cockpit)   │
              └──────────┬──────────┘
                         │
              Sidebar switches to project mode
              Pipeline auto-triggers (draft → planning)
                         │
                         ▼
              ┌─────────────────────┐
              │ Vision skill runs   │
              │ Chat shows progress │
              │ Pipeline: ◉ Vision  │
              └──────────┬──────────┘
                         │
                    skill completes
                    system message in chat
                    review banner appears
                         │
                         ▼
              ┌─────────────────────┐
              │ User reviews vision │
              │ artifact in viewer  │
              │                     │
              │ Click [Continue     │
              │  Pipeline]          │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Milestones skill    │
              │ runs…               │
              └──────────┬──────────┘
                         │
                    (repeat review gate
                     for each level)
                         │
                         ▼
              ┌─────────────────────┐
              │ Architecture skill  │
              │ (per milestone)     │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Design skill        │
              │ (per component)     │
              └──────────┬──────────┘
                         │
                    tasks extracted from
                    design docs → DB
                         │
                         ▼
              ┌─────────────────────┐
              │ Pipeline complete   │
              │ status → building   │
              │ Tasks visible in    │
              │ milestone tree      │
              │                     │
              │ User can start      │
              │ tasks, monitor      │
              │ agents, chat with   │
              │ orchestrator        │
              └─────────────────────┘
```

---

## User Flow: Return to an Existing Project

```
              ┌─────────────────────┐
              │ Dashboard or        │
              │ Projects List       │
              │ Click project card  │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ /projects/:id       │
              │ Cockpit loads       │
              │ Sidebar → project   │
              │ mode                │
              │                     │
              │ State reconstructed │
              │ from DB:            │
              │ - Pipeline level    │
              │ - Gate states       │
              │ - Chat history      │
              │ - Agent statuses    │
              │ - Milestone tree    │
              └─────────────────────┘
```

---

## User Flow: Navigate Between Projects

```
              ┌─────────────────────┐
              │ Inside Project A    │
              │ cockpit             │
              └──────────┬──────────┘
                         │
              Click "← All Projects"
              in sidebar
                         │
                         ▼
              ┌─────────────────────┐
              │ /projects           │
              │ Sidebar → global    │
              │ mode                │
              │ Project list shown  │
              └──────────┬──────────┘
                         │
              Click Project B card
                         │
                         ▼
              ┌─────────────────────┐
              │ /projects/:id-b     │
              │ Sidebar → project   │
              │ mode (Project B)    │
              └─────────────────────┘
```
