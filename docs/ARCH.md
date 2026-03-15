# ARCH — AutEng HQ

> Local-first desktop application for orchestrating AI agent-operated businesses.
> Level: System
> See [VISION.md](./VISION.md) for product scope and goals.

---

## System Overview

```mermaid
graph LR
    subgraph Local["Local Machine"]
        HQ["AutEng HQ<br/>(Electron + Next.js)"]
        DB["SQLite"]
        Agents["Dev Agents<br/>(Claude Code / Codex CLI)"]
        Projects["Project Workspaces<br/>(local git repos)"]
    end

    subgraph Cloud["Cloud Services"]
        Deploy["Deployment Targets<br/>(Vercel / AWS / etc.)"]
        AI["AI APIs<br/>(Claude / OpenAI)"]
        AutEng["Tooling<br/>(x402, MCP)"]
    end

    HQ --> DB
    HQ --> Agents
    HQ --> AutEng
    HQ --> Deploy
    HQ --> AI
    Agents --> Projects
```

Everything runs locally. HQ is the cockpit — it orchestrates agents, manages projects, triggers deploys, and monitors KPIs. Cloud services are consumed on-demand; HQ never depends on them for core operation.

**Deferred to v1+**: Mobile companion app (React Native / Expo) with WebSocket real-time sync. See [PLAN.md](./PLAN.md) deferred items.

## Component Architecture

```mermaid
graph TB
    subgraph Electron["Electron Shell"]
        Main["Main Process<br/>(Node.js runtime)"]
        subgraph Renderer["Renderer (Next.js)"]
            Dashboard["Dashboard"]
            ProjectView["Project View"]
            AgentMonitor["Agent Monitor"]
            DeployView["Deploy View"]
            Settings["Settings"]
            DesignSystem["Design System<br/>(dev-only)"]
        end
        subgraph Backend["Backend Services (Next.js API Routes)"]
            API["API Layer"]
            Orchestrator["Orchestrator"]
            subgraph ProcessLayer["Process Management"]
                ProcessRegistry["Process Registry<br/>(singleton)"]
                AgentManager["Agent Manager<br/>(Claude Agent SDK)"]
                BgProcessManager["Background Process<br/>Manager"]
                HqMcp["HQ MCP Server<br/>(in-process)"]
            end
            DocGenerator["Doc Generator"]
            DeployManager["Deploy Manager"]
            KPITracker["KPI Tracker"]
            FeedbackEngine["Feedback Engine"]
        end
    end

    Main -->|"IPC (preload bridge)"| Renderer
    Main -->|"spawns standalone<br/>Next.js server"| Backend
    Main -->|"before-quit cleanup"| ProcessRegistry
    Dashboard --> API
    ProjectView --> API
    AgentMonitor --> API
    DeployView --> API
    API --> Orchestrator
    Orchestrator --> AgentManager
    Orchestrator --> DocGenerator
    Orchestrator --> DeployManager
    Orchestrator --> KPITracker
    Orchestrator --> FeedbackEngine
    AgentManager --> ProcessRegistry
    BgProcessManager --> ProcessRegistry
    AgentManager -->|"injects"| HqMcp
    HqMcp -->|"reads output"| BgProcessManager
```

The Electron main process launches a standalone Next.js server and loads it in a BrowserWindow. The preload bridge exposes a minimal IPC API (`app:minimize`, `app:maximize`, `app:close`) with context isolation. Backend services run as Next.js API routes within the same process. The Process Registry singleton (on `globalThis`) tracks all running agent and background processes, enforcing concurrency limits and enabling clean shutdown on app quit.

## Data Flow — Prompt to Product

The core lifecycle from VISION: **Prompt → Plan → Build → Deploy → Monitor → Iterate**.

```mermaid
sequenceDiagram
    participant U as User
    participant HQ as HQ App
    participant AI as AI API (Claude)
    participant DG as Doc Generator
    participant AM as Agent Manager
    participant A as Dev Agent
    participant D as Deploy Manager
    participant F as Feedback Engine
    participant K as KPI Tracker

    U->>HQ: Starting prompt
    HQ->>DG: Generate workflow docs
    DG->>AI: Prompt → structured docs
    AI-->>DG: Generated content
    DG-->>HQ: VISION, ARCH, PLAN, TAXONOMY, CODING-STANDARDS
    HQ->>HQ: Create project workspace (git init, commit docs)

    loop Each Phase
        HQ->>AM: Start Phase N
        AM->>A: Spawn agent (Claude Code / Codex)
        A->>A: Read docs, implement tasks
        A-->>AM: Stream output (SSE)
        AM-->>HQ: Phase N complete
        HQ->>U: Approval gate
        U-->>HQ: Approve / reject
        HQ->>F: Phase Feedback
        F->>F: Review action logs, flag discoveries
        F-->>HQ: Doc updates applied
    end

    HQ->>D: Deploy
    D-->>HQ: Deployment URL
    HQ->>K: Begin monitoring
    K-->>HQ: KPI data stream

    HQ->>F: Version Feedback
    F-->>HQ: All docs reconciled

    loop Iterate
        K->>HQ: Alert (threshold breach / opportunity)
        HQ->>U: Notify — suggest iteration
        U->>HQ: Approve next version
        HQ->>DG: Seed v(N+1) docs (diff from vN)
    end
```

## Database Schema

The work unit hierarchy (`Project → Version → Phase`) is tracked in each project's documentation (PLAN.md, PLAN_PROGRESS_LOG.md). The database tracks only what the docs can't: the project registry, runtime agent process records, time-series metrics, and deployment history.

```mermaid
erDiagram
    projects {
        text id PK
        text name
        text prompt
        text status
        text workspace_path
        text deploy_url
        timestamp created_at
        timestamp updated_at
    }

    agent_runs {
        text id PK
        text project_id FK
        text phase_id FK "nullable"
        text agent_type
        text prompt
        text command
        text status
        text output
        text session_id
        text model
        int exit_code
        real cost_usd
        int turn_count
        int max_turns
        real budget_usd
        timestamp created_at
        timestamp completed_at
    }

    background_processes {
        text id PK
        text project_id FK
        text process_type "dev_server | test_watcher | build_watcher | custom"
        text command
        text args "JSON array"
        text status
        int port
        text url
        timestamp started_at
        timestamp stopped_at
    }

    process_configs {
        text id PK
        text project_id FK "nullable = global default"
        int max_agents "default 5"
        int max_background "default 3"
        text default_model "default sonnet"
        int default_max_turns "default 50"
        real default_budget_usd "default 5.0"
        timestamp created_at
        timestamp updated_at
    }

    kpi_snapshots {
        text id PK
        text project_id FK
        text metric_name
        real metric_value
        timestamp recorded_at
    }

    deploy_events {
        text id PK
        text project_id FK
        text platform
        text environment
        text version_label
        text status
        text url
        timestamp deployed_at
    }

    projects ||--o{ agent_runs : "spawns"
    projects ||--o{ background_processes : "runs"
    projects ||--o| process_configs : "configures"
    projects ||--o{ kpi_snapshots : "tracks"
    projects ||--o{ deploy_events : "deploys"
```

**Design rationale:** Versions, phases, and their statuses live in the project's docs directory — PLAN.md defines them, PLAN_PROGRESS_LOG.md tracks progress, WORKFLOW_AUDIT.md logs orchestrator decisions. Duplicating this hierarchy in the DB would create two sources of truth. The DB owns runtime artifacts: which agent processes ran (and their output), what was deployed, and what metrics were collected. See [TAXONOMY.md](./TAXONOMY.md) for status enums.

## Component Boundaries

| Component | Owns | Does NOT Own |
|-----------|------|-------------|
| **Electron Main** | Window lifecycle, IPC bridge, spawning Next.js server, native OS integration, triggering process cleanup on quit | UI rendering, business logic |
| **Orchestrator** | Phase sequencing, project lifecycle, approval gates | Agent implementation details |
| **Process Registry** | In-memory map of all running processes (agents + background), concurrency limit enforcement, lifecycle events | Process implementation details, DB persistence |
| **Agent Manager** | Spawning/killing Claude Agent SDK `query()` instances, streaming output (SSE), recording run results, session resume | What the agent builds, background processes |
| **Background Process Manager** | Spawning/killing dev servers, test watchers, build watchers; ring-buffered output capture; health checks; port detection | Agent processes, what the processes produce |
| **HQ MCP Server** | In-process MCP tools that agents use to interact with HQ (read background process output, start/stop processes) | Agent logic, process implementation |
| **Doc Generator** | Generating workflow docs from prompt via AI API | Editing docs after generation (that's the Feedback Engine or agents) |
| **Deploy Manager** | Triggering deployments, tracking URLs and status | Hosting infrastructure |
| **KPI Tracker** | Collecting, storing, and surfacing metrics; threshold alerting | Defining what metrics matter (that's in the project's VISION) |
| **Feedback Engine** | Reviewing action logs, flagging doc updates, running feedback checklists (see [WORKFLOW.md](./WORKFLOW.md)) | Deciding *what* to change (that's the agent or user) |
| **Design System** | Token definitions, component registry, dev-only `/design-system` route (see [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)) | Business logic, data flow |

## Integration Points

| Protocol | Used For | Direction |
|----------|----------|-----------|
| **Electron IPC** | Window controls, native OS features (preload bridge with context isolation) | Main ↔ Renderer |
| **Claude Agent SDK** | Programmatic agent spawning via `query()` — typed streaming, abort, resume, tool control | HQ → Agent subprocess |
| **In-process MCP** | HQ MCP server injected into agents via SDK `mcpServers` option — agents pull background process output, start/stop dev servers | Agent → HQ (within same Node.js process) |
| **stdio** | Background process communication (dev servers, test watchers, build watchers as child processes) | HQ ↔ Background process |
| **SSE** | Streaming agent output to UI in real-time | Backend → Renderer |
| **REST** | Internal API routes, cloud deployments, AI API calls | Renderer → API, HQ → Cloud |
| **MCP** | Tool integration (agents ↔ external services) | Bidirectional |
| **x402** | Pay-per-request X402 | HQ → Cloud |

**Deferred to v1+**: WebSocket (Socket.io) for mobile companion app real-time sync.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | Electron 40 | Cross-architecture macOS distribution, native OS integration, embeds Node.js runtime |
| UI framework | Next.js 16 (React 19) | SSR for fast renders, API routes as backend, standalone output for Electron |
| Styling | Tailwind CSS 4 + shadcn/ui v4 | Utility-first with OKLch token system, Radix primitives for accessibility |
| Component primitives | Radix UI | Accessible, unstyled primitives consumed via shadcn |
| Local database | SQLite (better-sqlite3 + Drizzle ORM) | Zero-config embedded DB, WAL mode for concurrent reads, type-safe queries |
| Agent orchestration | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) | Typed `query()` API for spawning Claude instances with streaming, abort, resume, MCP injection, budget/turn limits |
| Agent streaming | SSE (Server-Sent Events) | One-way real-time stream from agent processes to UI |
| Package manager | pnpm 10 | Workspace support, strict dependency resolution, disk-efficient |
| Monorepo | Turborepo | Task orchestration, caching, dependency graph across apps/packages |
| Desktop packaging | electron-builder | macOS .dmg builds for arm64 + x86_64, pnpm symlink handling |
| Language | TypeScript 5.9 (strict) | End-to-end type safety |
| Icons | lucide-react | Consistent icon set, tree-shakeable |

## Target Architecture

| Component | Platform | Architecture | Notes |
|-----------|----------|-------------|-------|
| HQ Desktop | macOS | arm64 (Apple Silicon) | Primary target, Electron |
| HQ Desktop | macOS | x86_64 (Intel) | Secondary target, Electron |
| Dev Agents | macOS | Host architecture | Claude Code / Codex CLI run as child processes |
| SQLite DB | Local filesystem | `data/hq.db` or `HQ_DATA_DIR` env | WAL mode, foreign keys enabled |
| Project Workspaces | Local filesystem | User-configured path | One git repo per project |

**Runtime requirements**: Node.js (bundled with Electron), git (system install).

**Deferred platforms**: Linux and Windows desktop (v1+), mobile iOS/Android (v1+).

## Key Decisions

| Decision | Choice | Alternatives Considered |
|----------|--------|------------------------|
| Local-first vs cloud | **Local-first** — all data on user's machine | Cloud-hosted SaaS — rejected: contradicts user control principle, adds auth/billing complexity |
| Desktop framework | **Electron** | Tauri — smaller binary but less Node.js ecosystem support for agent spawning via stdio |
| Database | **SQLite** | PostgreSQL — unnecessary for local single-user app. IndexedDB — no server-side access for API routes |
| Agent interface | **Claude Agent SDK** (`query()` API) | Raw CLI spawning (`claude -p`) — requires manual NDJSON parsing, no typed messages, no abort/resume. Anthropic API SDK directly — loses Claude Code's built-in tools (file editing, bash, grep). Docker — too heavy for local dev agents |
| Agent permissions | **Full bypass** (`permissionMode: 'bypassPermissions'`) | Per-tool allowlists — adds UI complexity. HQ is the trust boundary; agents scoped to project workspace via `cwd` |
| Agent output streaming | **SSE** | WebSocket — bidirectional not needed for output streaming. Polling — poor UX for real-time output |
| Background output feedback | **In-process MCP server** (agents pull on demand) | Push into agent context — risks context explosion. Log files — agents can't query filtered output. Shared memory — unnecessary complexity |
| UI within Electron | **Next.js standalone server** | Static export — loses API routes. Vite — no built-in API route layer |
| ORM | **Drizzle** | Prisma — heavier runtime, SQLite support less mature. Raw SQL — loses type safety |
| Doc generation | **AI API (Claude)** | Templates — too rigid. User-authored — defeats prompt-to-product goal |
| Monorepo tool | **Turborepo** | Nx — heavier config. Lerna — less maintained |
| Free + open source | **No billing in HQ** | Freemium — rejected: HQ is the cockpit, not the engine. Users pay for cloud services directly |

## Process Management

HQ manages two categories of child processes: **agent processes** (Claude instances doing work) and **background processes** (dev servers, test watchers, build watchers). Both are tracked through a three-layer architecture:

```
ProcessRegistry (singleton on globalThis, survives hot reload)
  ├── AgentManager        — Claude Agent SDK query() instances
  └── BackgroundProcessManager — child_process.spawn for support processes
```

### Process Registry

Singleton in-memory map of all running processes. Stored on `globalThis[Symbol.for("auteng.processRegistry")]` to survive Next.js hot reloads. Enforces concurrency limits:

| Limit | Default | Scope |
|-------|---------|-------|
| Global max processes | 15 | All projects combined |
| Max agents per project | 5 | Per project |
| Max background processes per project | 3 | Per project |

Emits events: `process:started`, `process:stopped`, `process:failed`. Electron main process calls `shutdownAll()` on `before-quit`.

### Agent Manager

Wraps the Claude Agent SDK `query()` function. Each agent instance has:
- **AbortController** for clean cancellation
- **Session ID** for resume capability after HQ restart
- **Output accumulator** that batches DB writes (every 5s or 50 messages)
- **SSE stream** for real-time UI updates

Agents run with `permissionMode: 'bypassPermissions'` — HQ is the trust boundary. Each agent is scoped to its project workspace via `cwd`. The project's `CLAUDE.md` is auto-loaded via `settingSources: ['project']`.

On HQ restart: scan `agent_runs` for `status=running`, mark as `failed`. User can resume via stored `session_id`.

### Background Process Manager

Manages long-lived support processes via `child_process.spawn`:

| Process Type | Examples | Special Behavior |
|-------------|----------|-----------------|
| `dev_server` | `next dev`, `vite dev` | Port detection (parse stdout), health check polling |
| `test_watcher` | `vitest --watch`, `jest --watch` | — |
| `build_watcher` | `tsc --watch` | — |

Output captured in a **ring buffer** (500 lines, fixed-size circular). Agents access this via the HQ MCP Server — they pull output on demand rather than having it pushed into their context.

Shutdown cascade: SIGTERM → 5s → SIGINT → 3s → SIGKILL.

### HQ MCP Server

In-process MCP server created via `createSdkMcpServer()` and injected into every agent instance through the SDK's `mcpServers` option. Exposes tools:

| Tool | Purpose |
|------|---------|
| `get_process_output(projectId, processType?, lines?)` | Read recent ring buffer content |
| `get_dev_server_url(projectId)` | Get running dev server URL |
| `get_process_status(projectId)` | Status of all background processes |
| `start_process(processType, command, args)` | Start a background process |
| `stop_process(projectId, processType?)` | Stop background processes |

This is the key integration between agents and background processes. Agents can check compilation errors, test results, or dev server status without the output being pushed into their context window.

## Architectural Considerations

### Performance

- **Target**: Support 10+ concurrent projects without UI lag (VISION success metric)
- **SQLite WAL mode**: Enables concurrent reads while writing agent output
- **SSE streaming**: Agent output rendered incrementally, not buffered
- **Turborepo caching**: Rebuilds only what changed across the monorepo

### Scalability

- **Agent concurrency**: ProcessRegistry enforces limits — 15 total processes, 5 agents per project, 3 background processes per project. Configurable via `process_configs` table. Each SDK `query()` spawns a Claude Code subprocess
- **Memory**: Ring buffers cap background output at 500 lines per process. Agent output accumulated in memory and flushed to DB in batches
- **Database growth**: SQLite handles single-digit GB well. Agent output (`agent_runs.output`) is the largest growth vector — may need rotation or archival for long-running projects
- **Multi-project**: Dashboard aggregation queries should use indexed columns (`project_id`, `status`, `created_at`)

### Security

- **Local-first**: No network-exposed services. Data never leaves the machine unless the user deploys
- **Electron context isolation**: Preload bridge with explicit allowlisted IPC channels
- **API keys**: Stored locally (env vars or encrypted config). Never committed to project workspaces
- **Agent sandboxing**: Agents run via Claude Agent SDK with `permissionMode: 'bypassPermissions'` — HQ is the trust boundary. Each agent scoped to its project workspace via `cwd`. No cross-project filesystem access

### Observability

- **Every agent action logged**: Run records with command, output, exit code, timestamps
- **Workflow audit trail**: Orchestrator decisions logged to WORKFLOW_AUDIT.md per project
- **Plan progress tracking**: Task completions logged to PLAN_PROGRESS_LOG.md per project
- **KPI snapshots**: Time-series metrics for deployed projects

## Related Documents

| Document | Relationship |
|----------|-------------|
| [VISION.md](./VISION.md) | Product scope, target users, success metrics — ARCH implements this |
| [PLAN.md](./PLAN.md) | Phased build plan with detailed Phase 1+2 breakdowns — references ARCH for component design, schema, and process management |
| [TAXONOMY.md](./TAXONOMY.md) | Entity names, status enums, naming conventions — ARCH schema uses these |
| [WORKFLOW.md](./WORKFLOW.md) | Session protocol, feedback stages — ARCH components implement this |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Token architecture, component registry — consumed by Renderer |
| [CODING-STANDARDS.md](./CODING-STANDARDS.md) | Quality rules — applied during implementation |
