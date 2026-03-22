# PLAN PROGRESS LOG — AutEng HQ

## 2026-03-07

### v0 / Pre-Phase / Doc Setup
- **Action**: Created foundational workflow documents: VISION.md, ARCH.md, PLAN.md, TAXONOMY.md, CODING-STANDARDS.md
- **Outcome**: All 5 core docs in place
- **Discovery**: None

### v0 / Pre-Phase / Tech Stack Decision
- **Action**: Decided on Electron + Next.js (HQ), React Native/Expo (mobile), Turborepo monorepo, TypeScript throughout
- **Outcome**: Stack documented in ARCH.md
- **Discovery**: Electron is necessary for .dmg distribution — Tauri can't run Next.js API routes natively

### v0 / Pre-Phase / Workflow & Hierarchy
- **Action**: Established Project → Version → Phase → Task hierarchy. Created WORKFLOW.md with feedback stages (phase, version, shutdown). Updated PLAN.md with task-level breakdown. Updated TAXONOMY.md with hierarchy terms and feedback/version statuses. Added Feedback Engine to ARCH.md components.
- **Outcome**: All docs aligned on hierarchy and feedback loop
- **Discovery**: Feedback is a first-class architectural component — added Feedback Engine to ARCH.md component diagram and boundaries table

### v0 / Phase 0 / Task 0.1 — Monorepo restructure
- **Action**: Moved `hq/` → `apps/hq/`. Added Turborepo config (`turbo.json`, `pnpm-workspace.yaml`), root `package.json`, `packages/shared/` stub with TypeScript config.
- **Outcome**: `pnpm build` runs via Turborepo successfully. Monorepo structure in place.
- **Discovery**: `.npmrc` with `node-linker=hoisted` required for electron-builder compatibility with pnpm.

### v0 / Phase 0 / Task 0.2 — Electron shell
- **Action**: Created `electron/main.ts`, `electron/preload.ts`, `electron/tsconfig.json`. Main process loads Next.js dev server in dev, standalone server in production. Context isolation enabled, macOS `hiddenInset` title bar.
- **Outcome**: Electron TypeScript compiles to `dist-electron/`. Shell ready to wrap Next.js.
- **Discovery**: Next.js standalone output mirrors monorepo structure (`apps/hq/server.js` inside `.next/standalone/apps/hq/`). Required adjusting electron-builder paths and main process server path.

### v0 / Phase 0 / Task 0.3 — Build pipeline
- **Action**: Added `electron-builder.yml` with macOS dmg config. Added `dev:electron` (concurrently + wait-on), `build:electron` (next build + tsc + electron-builder) scripts. Set `output: "standalone"` in `next.config.mjs`.
- **Outcome**: Dev and production build scripts in place. Standalone build produces `server.js`.
- **Discovery**: None — Nextron is stale (Next.js 14 only), custom standalone approach is correct for Next.js 16.

### v0 / Phase 0 / Task 0.4 — L3 semantic status tokens
- **Action**: Added 6 status tokens (`--status-running`, `--status-completed`, `--status-failed`, `--status-queued`, `--status-paused`, `--status-draft`) to both `:root` and `.dark` in `globals.css`. Registered in `@theme inline` block for Tailwind utility generation.
- **Outcome**: `bg-status-running`, `text-status-completed`, etc. available as Tailwind classes.
- **Discovery**: None.

### v0 / Phase 0 / Task 0.5 — shadcn components
- **Action**: Added Sidebar, Card, Badge, Input, Separator, Tooltip, Avatar, Skeleton via shadcn CLI. Sheet added as sidebar dependency. Added `TooltipProvider` to root layout.
- **Outcome**: 10 UI components in `components/ui/`. All build successfully.
- **Discovery**: None.

### v0 / Phase 0 / Task 0.6 — Dashboard shell layout
- **Action**: Created `AppSidebar` component with nav items (Dashboard, Projects, Agents, Deploys, Settings). Updated root layout with `SidebarProvider`, `SidebarInset`, header with `SidebarTrigger`. Created stub pages for all routes.
- **Outcome**: App has collapsible sidebar navigation with active state highlighting. All routes accessible.
- **Discovery**: None.

### v0 / Phase 0 / Task 0.7 — Component registry
- **Action**: Created `components/registry/` with `types.ts` (AtomicLevel, RegistryEntry), `entries.ts` (10 entries: 9 atoms, 1 molecule), `helpers.ts` (getByLevel, getGrouped, getCounts).
- **Outcome**: Canonical component registry matching DESIGN_SYSTEM.md spec.
- **Discovery**: None.

### v0 / Phase 0 / Task 0.8 — Design system route
- **Action**: Created `/design-system` with tab navigation layout, overview page (registry summary + category cards), `/tokens` page (color swatches, typography scale, spacing bars, radius samples, shadow samples), `/components` page (grouped by atomic level with descriptions and source paths).
- **Outcome**: Living design system at `/design-system` with 3 pages. All token categories visualized.
- **Discovery**: None.

### v0 / Phase 0 / Task 0.9 — SQLite database
- **Action**: Installed `drizzle-orm` + `better-sqlite3`. Created schema in `lib/db/schema.ts` matching ARCH.md ERD (5 tables: projects, phases, agent_tasks, kpi_snapshots, deploy_events). Created `lib/db/index.ts` with singleton connection. Generated migration. Pushed schema.
- **Outcome**: `data/hq.db` created with all 5 tables. WAL mode and foreign keys enabled.
- **Discovery**: `better-sqlite3` requires `pnpm.onlyBuiltDependencies` allowlist in root `package.json` for native addon compilation.

### v0 / Phase 0 / Task 0.10 — API route scaffolding
- **Action**: Created `app/api/projects/route.ts`, `app/api/agents/route.ts`, `app/api/deploys/route.ts`. Each returns JSON from the corresponding DB table.
- **Outcome**: API stubs build and are registered as dynamic routes. Return empty arrays from fresh DB.
- **Discovery**: None.

### v0 / Phase 0 / Exit — .dmg build verified
- **Action**: Ran `pnpm build:electron`. Fixed package name (spaces invalid for electron-builder). Fixed pnpm symlink issue in standalone output by adding `electron:prep` step (rsync with dereference, excluding `.pnpm` store). Verified both arm64 and x64 .dmg files produced.
- **Outcome**: `AutEng HQ-0.0.1-arm64.dmg` (206 MB) and `AutEng HQ-0.0.1.dmg` (213 MB) built and signed successfully.
- **Discovery**: pnpm standalone output contains symlinks into `.pnpm` store. Must dereference with `rsync -aL --exclude '.pnpm'` before electron-builder packaging. Broken symlinks in `.pnpm` cause `cp -RL` to fail.

### v0 / Phase 0 / Post-Exit — .dmg launch fix
- **Action**: App crashed when launched from `/Applications`. Five issues identified and fixed:
  1. `app.getAppPath()` points inside asar — changed to `process.resourcesPath` for extraResources path resolution in `electron/main.ts`.
  2. ESM/CJS conflict: `package.json` had `"type": "module"` but `electron/tsconfig.json` compiles to CommonJS. Fixed by removing `"type": "module"` — all config files already use explicit `.mjs` extensions.
  3. Previous build artifacts in `release/` were included in standalone package via rsync, causing codesign failure on nested `.app` bundles.
  4. `get-port-please` not available in asar (devDependency). Replaced with Node.js built-in `net.createServer().listen(0)` — zero external dependencies for port detection.
  5. Next.js standalone file tracing is designed for serverless (Vercel), not Electron. Traced `node_modules` only contain partial files (e.g., just `package.json` from `@swc/helpers`). Created `scripts/electron-prep.sh` that: (a) copies standalone output with dereferenced symlinks, (b) merges root-level modules into app-level `node_modules`, (c) replaces all partially-traced modules with full versions from installed `node_modules`.
- **Outcome**: .dmg builds cleanly. App launches, Next.js server starts (`✓ Ready in 59ms`), and the Electron window opens.
- **Discovery**:
  - `"type": "module"` in `package.json` is unnecessary when config files use explicit `.mjs` extensions, and conflicts with Electron's CJS main process.
  - Stale app-level `pnpm-lock.yaml` (from before monorepo restructure) confused Next.js workspace detection — removed.
  - `outputFileTracingRoot` must be set explicitly to monorepo root for proper dependency tracing.
  - `outputFileTracingIncludes` paths are relative to the app root, not the tracing root — use `../../node_modules/` to reference monorepo root modules.
  - electron-builder strips `node_modules/` from `extraResources` — must merge root modules into app-level `node_modules` during prep.
  - Full module copies must use `-L` (dereference) and `--exclude '.bin'` to avoid dangling symlinks that break codesign.

### v0 / Phase 0 — Complete
- **Exit Criteria Met**:
  - ✅ App launches locally (`pnpm dev`)
  - ✅ Build produces working .dmg (arm64 + x64)
  - ✅ App launches from built .dmg and serves Next.js
  - ✅ SQLite DB created with schema (5 tables matching ARCH.md)
- **Feedback**: CODING-STANDARDS.md updated to reflect monorepo structure. PLAN.md updated to reflect shadcn scaffold starting point. Package name changed from `AutEng HQ` to `auteng-hq` (npm naming rules).

## 2026-03-15

### v0 / Pre-Phase 1 / Architecture — Agent orchestration design
- **Action**: Resolved three open architecture questions: (1) how to manage multiple Claude instances across projects, (2) what execution mode to use, (3) how background processes feed back to agents. Updated ARCH.md and PLAN.md with detailed designs.
- **Outcome**: Architecture decisions documented and locked in:
  - **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) chosen over raw CLI spawning — typed streaming, AbortController, session resume, MCP injection, budget/turn limits
  - **Three-layer process management**: ProcessRegistry singleton (concurrency limits, lifecycle events) → AgentManager (SDK `query()` wrapper) + BackgroundProcessManager (`child_process.spawn` for dev servers, test watchers, build watchers)
  - **In-process MCP server** for agent ↔ background process feedback — agents pull output on demand via `get_process_output()`, no context explosion
  - **Full bypass permissions** (`permissionMode: 'bypassPermissions'`) — HQ is the trust boundary, agents scoped to project workspace via `cwd`
  - **Agent runs support both project-level and phase-level scoping** — `project_id` FK added, `phase_id` made nullable
- **Discovery**: None — decisions informed by Claude Agent SDK capabilities

### v0 / Pre-Phase 1 / Docs — ARCH.md updates
- **Action**: Updated ARCH.md with: new Process Management section (ProcessRegistry, AgentManager, BackgroundProcessManager, HQ MCP Server), expanded DB schema (added `background_processes` and `process_configs` tables, expanded `agent_runs` with session_id/model/prompt/cost/turn tracking), updated Component Architecture diagram, updated Component Boundaries table (3 new rows), updated Integration Points (Claude Agent SDK, In-process MCP), new Key Decisions (SDK vs CLI, full bypass permissions, MCP feedback), updated Tech Stack (added `@anthropic-ai/claude-agent-sdk`), updated Scalability and Security sections.
- **Outcome**: ARCH.md fully reflects agent orchestration architecture
- **Discovery**: None

### v0 / Pre-Phase 1 / Docs — PLAN.md restructure
- **Action**: Folded detailed Phase 1+2 task breakdowns into PLAN.md (was temporarily in a separate v1_PLAN.md). Each phase now has a summary table + detailed breakdown section. Phase 0 marked complete. Added file structure and task dependency graphs. Updated current state to reflect Phase 0 completion. Deleted v1_PLAN.md.
- **Outcome**: Single PLAN.md is the source of truth for all phases. `docs/v1/` directory reserved for actual version 1 per WORKFLOW.md convention.
- **Discovery**: Naming `v1_PLAN.md` was confusing — "v1" implied version 1 but was actually a detailed expansion of v0 phases. Resolved by folding into PLAN.md with two levels: summary tables (scannable) + detailed breakdowns (implementation-ready).

### v0 / Pre-Phase 1 / Docs — TAXONOMY.md updates
- **Action**: Added Background Process entity definition, Background Process Status enum (starting/running/stopped/failed), Background Process Types enum (dev_server/test_watcher/build_watcher/custom). Updated Dev Agent definition to reference Claude Agent SDK.
- **Outcome**: TAXONOMY.md consistent with ARCH.md schema and PLAN.md task descriptions
- **Discovery**: None

### v0 / Phase 1 / Task 1.1 — New Project UI
- **Action**: Created `/projects/new` page with `ProjectForm` component. Form includes project name input, prompt textarea (min 20 chars), AI model selector (sonnet/opus/haiku). On submit, creates project via POST then triggers doc generation via SSE stream with live progress display.
- **Outcome**: Full project creation flow from form to generation with real-time status feedback.
- **Discovery**: None

### v0 / Phase 1 / Task 1.2 — Project CRUD API with Zod validation
- **Action**: Created Zod schemas in `lib/validations/project.ts`. Rewrote `GET /api/projects` with status filter param. Added `POST /api/projects` (create). Created `app/api/projects/[id]/route.ts` with GET (single project + phases), PATCH (update), DELETE (soft archive → status `archived`).
- **Outcome**: Full CRUD API with input validation. Uses `drizzle-orm` `eq` operator for queries.
- **Discovery**: None

### v0 / Phase 1 / Task 1.3 — Doc Generator
- **Action**: Created `lib/services/doc-generator.ts`. Uses `@anthropic-ai/sdk` (Anthropic API SDK) to generate 5 workflow docs. Chain: VISION → ARCH (with VISION context) → PLAN (with VISION+ARCH context) → TAXONOMY + CODING-STANDARDS in parallel (with all prior context). Each doc has a tailored system prompt defining structure and sections.
- **Outcome**: Generates complete, project-specific workflow documentation from a single prompt.
- **Discovery**: Doc generation uses Anthropic API SDK (`@anthropic-ai/sdk`) directly — not the Agent SDK (`@anthropic-ai/claude-agent-sdk`). The Agent SDK is for Phase 2 agent execution. These are distinct dependencies.

### v0 / Phase 1 / Task 1.4 — Local workspace creation
- **Action**: Created `lib/services/workspace.ts`. Creates `~/auteng-projects/<slug>/` with `docs/` directory containing all 5 generated docs + 2 empty append-only logs (PLAN_PROGRESS_LOG.md, WORKFLOW_AUDIT.md). Generates CLAUDE.md at repo root with project name, doc read order, and tech stack summary extracted from ARCH.md. Runs `git init` + initial commit.
- **Outcome**: Each project gets an isolated git repo with workflow docs, ready for agent consumption.
- **Discovery**: None

### v0 / Phase 1 / Task 1.5 — Project list view
- **Action**: Rewrote `/projects` page as client component. Card grid with project name, status badge (using semantic OKLch status tokens), prompt preview, created date. Status filter tabs (all/draft/planning/building/deployed/archived). Empty state with CTA. Created reusable `StatusBadge` component.
- **Outcome**: Full project list with filtering and loading skeletons.
- **Discovery**: None

### v0 / Phase 1 / Task 1.6 — Project detail view
- **Action**: Created `/projects/[id]` page with tabbed layout. Header shows name, status badge, workspace path, and action buttons (Generate/Regenerate/Archive). Tabs: Docs (nested tabs for each of 5 docs, rendered as pre-formatted text), Phases (list from DB), Agents (placeholder), Deploys (placeholder). Doc reading via `GET /api/projects/:id/docs` which reads files from workspace filesystem.
- **Outcome**: Full project detail view with doc viewer and phase breakdown.
- **Discovery**: None

### v0 / Phase 1 / Additional — Dashboard + sidebar updates
- **Action**: Rewrote dashboard (`/`) with stats cards (total projects, active, agents), recent projects list with status badges. Updated sidebar to highlight parent route for sub-routes (e.g., `/projects/new` highlights "Projects"). Added shadcn components: Textarea, Select, Tabs, Label, Dialog.
- **Outcome**: Dashboard is now a functional landing page. Sidebar navigation is context-aware.
- **Discovery**: None

### v0 / Phase 1 / Testing — 55-test suite
- **Action**: Added Vitest with jsdom + @testing-library/react. Created test infrastructure: `vitest.config.ts`, `vitest.setup.ts`, `lib/test-helpers.ts` (in-memory SQLite factory + project seeder). Test files: `project.test.ts` (15 validation tests), `doc-generator.test.ts` (7 service tests), `workspace.test.ts` (8 service tests), `route.test.ts` (8 project list API tests), `[id]/route.test.ts` (12 project detail API tests), `status-badge.test.tsx` (5 component tests).
- **Outcome**: 55 passing tests covering validations, API routes, services, and components.
- **Discovery**: `vi.mock` with `require()` path aliases fails inside factory functions — use `vi.importActual()` instead. Mock classes needed for `new Anthropic()` pattern. Next.js `NextRequest` needed instead of standard `Request` for `.nextUrl` property.

### v0 / Phase 1 / Electron — Production DB crash fix
- **Action**: Fixed multiple Electron production issues: (1) DB path used `process.cwd()` which is read-only inside `.app` bundle — changed to `~/Library/Application Support/AutEng HQ/data/` via `HQ_DATA_DIR` env var. (2) Added `CREATE TABLE IF NOT EXISTS` for all 5 tables (Drizzle doesn't auto-create). (3) Added `better-sqlite3` to `serverExternalPackages` in `next.config.mjs`. (4) Added comprehensive file logging to `~/Library/Logs/auteng-hq/main.log`. (5) Hardened API error handling with try/catch on all routes.
- **Outcome**: Electron production app can create and read from SQLite DB.
- **Discovery**: `app.getPath("logs")` returns `~/Library/Logs/auteng-hq/` (lowercase, from package.json name), not `~/Library/Logs/AutEng HQ/`.

### v0 / Phase 1 / Electron — Native module rebuild fix
- **Action**: Fixed NODE_MODULE_VERSION 141 vs 143 crash. Root cause: Next.js standalone traces `better-sqlite3` into content-hashed `.next/node_modules/better-sqlite3-<hash>/` directories. The old rebuild step only fixed the regular `node_modules/` copy, but Node's `require()` resolved to the content-hashed one. Fix: (1) Added `@electron/rebuild` as devDependency. (2) Updated `electron-prep.sh` to rebuild `better-sqlite3` for Electron then `find` and replace ALL `.node` copies in the standalone package. (3) Added `asarUnpack: ["**/*.node"]` to `electron-builder.yml` so native binaries are extracted outside asar for `dlopen()`.
- **Outcome**: Electron production app loads SQLite correctly. Project creation works end-to-end.
- **Discovery**: Next.js standalone traces native modules into `.next/node_modules/<pkg>-<content-hash>/` directories. At runtime, Node resolves to these copies, not the regular `node_modules/` copy. Must find and replace ALL `.node` binaries after `@electron/rebuild`, not just the primary one.

### v0 / Phase 1 / Build — Auto version bumping
- **Action**: Created `scripts/bump-version.sh` (auto-increments patch version, supports major/minor/patch arg). Wired into `build:electron` script as first step. Added `apps/hq/main.js` to `.gitignore` (compiled artifact). Also added `docs/SOFTWARE_PHILOSOPHY.md` documenting core principles (DRY, composition over inheritance, model real world in ERD, fail fast, SOLID, YAGNI, explicit over implicit, minimise blast radius, optimise for reading).
- **Outcome**: Every DMG build gets a unique, monotonically increasing version number.
- **Discovery**: None

### v0 / Phase 1 — Complete
- **Exit Criteria Met**:
  - ✅ Prompt → project with 5 docs + CLAUDE.md
  - ✅ Git repo created on disk at `~/auteng-projects/<slug>/`
  - ✅ Visible in dashboard (project list with status filtering)
  - ✅ Project detail shows rendered docs in tabbed viewer
  - ✅ Electron production .dmg works (SQLite, native modules, logging)
  - ✅ 55 tests passing (validations, APIs, services, components)
- **Phase Feedback**:
  - All phase discoveries reviewed — one clarification: `@anthropic-ai/sdk` (Anthropic API) used for doc generation; `@anthropic-ai/claude-agent-sdk` (Agent SDK) reserved for Phase 2.
  - ARCH.md still accurate — Phase 1 added no new component boundaries.
  - PLAN.md remaining phases still accurate — no scope changes discovered.
  - Key Electron packaging lesson: Next.js standalone + native modules requires careful handling of content-hashed traced copies.
  - No orphaned TODOs or undocumented decisions.

## 2026-03-16

### v0 / Phase 2 / Task 2.1 — Dependencies
- **Action**: Installed `@anthropic-ai/claude-agent-sdk@^0.2.76`, `uuid@^13.0.0`, `@types/uuid@^11.0.0`. Added `@anthropic-ai/claude-agent-sdk` to `serverExternalPackages` in `next.config.mjs`.
- **Outcome**: All SDK dependencies available.
- **Discovery**: `zod` was already installed from Phase 1 — no duplication needed.

### v0 / Phase 2 / Task 2.2 — Schema Migration
- **Action**: Replaced `agentTasks` table with `agentRuns` table (added `project_id` FK, nullable `phase_id`, `session_id`, `model`, `prompt`, `cost_usd`, `turn_count`, `max_turns`, `budget_usd`). Created `background_processes` table (process_type, command, args, status, port, url). Created `process_configs` table (per-project or global defaults for concurrency, model, turns, budget). Added `version_label` to `deploy_events`. Updated `SCHEMA_SQL` in `lib/db/index.ts`. Updated test helpers.
- **Outcome**: All 8 tables in schema match ARCH.md ERD exactly.
- **Discovery**: Zod v4 uses `.issues` not `.errors` for validation error access. Updated API routes accordingly.

### v0 / Phase 2 / Task 2.4 — RingBuffer + Shared Types
- **Action**: Created `lib/process/types.ts` with all process management types: `ManagedProcess`, `AgentInstance`, `BackgroundProcess`, `AgentConfig`, `ConcurrencyLimits`, `RingBufferEntry`, `ConcurrencyLimitError`. Created `lib/process/ring-buffer.ts` with 500-line circular buffer (push, getAll, getLast, clear).
- **Outcome**: Shared type system and ring buffer ready for use by all process managers.
- **Discovery**: None.

### v0 / Phase 2 / Task 2.3 — ProcessRegistry Singleton
- **Action**: Created `lib/process/process-registry.ts`. Singleton on `globalThis[Symbol.for("auteng.processRegistry")]`. Extends `EventEmitter`. Methods: register, unregister, markFailed, get, getByProject, getByType, getAll, count, countByProject, shutdownAll. Enforces concurrency limits (15 global, 5 agents/project, 3 background/project).
- **Outcome**: Central registry for all running processes with event emission and concurrency enforcement.
- **Discovery**: None.

### v0 / Phase 2 / Task 2.5 — BackgroundProcessManager
- **Action**: Created `lib/process/background-process-manager.ts`. Manages `child_process.spawn` for dev servers, test watchers, build watchers. Pipes stdout/stderr to RingBuffer. Auto-detects port from dev server output. Health check polling for dev servers. Graceful shutdown cascade: SIGTERM → 5s → SIGINT → 3s → SIGKILL. DB persistence for all state changes.
- **Outcome**: Full lifecycle management for background processes.
- **Discovery**: None.

### v0 / Phase 2 / Task 2.6 — HQ MCP Server
- **Action**: Created `lib/process/hq-mcp-server.ts` using `createSdkMcpServer()` from Agent SDK. 5 tools with Zod schemas: `get_process_output`, `get_dev_server_url`, `get_process_status`, `start_process`, `stop_process`. Each tool scoped to the agent's project via closure over `projectId`.
- **Outcome**: In-process MCP server injectable into every agent instance.
- **Discovery**: The Agent SDK's `tool()` helper expects return values with `content: [{ type: "text", text: string }]` format (MCP CallToolResult).

### v0 / Phase 2 / Task 2.7 — AgentManager
- **Action**: Created `lib/process/agent-manager.ts`. Wraps SDK `query()` with spawn, cancel, resume, streamOutput. Maps model shortnames (sonnet/opus/haiku) to full model IDs. Consumes AsyncGenerator in background loop. Broadcasts to SSE subscribers. Session ID capture from messages. Turn counting. DB status updates throughout lifecycle. Uses `permissionMode: 'bypassPermissions'` + `allowDangerouslySkipPermissions: true`.
- **Outcome**: Full agent lifecycle management with streaming and resume.
- **Discovery**: Agent SDK requires `allowDangerouslySkipPermissions: true` in addition to `permissionMode: 'bypassPermissions'`.

### v0 / Phase 2 / Task 2.8 — Output Accumulator
- **Action**: Created `lib/process/output-accumulator.ts`. Batches SDKMessage writes to DB every 5 seconds or 50 messages. Merges with existing output JSON array. Final flush on stop.
- **Outcome**: Prevents per-token DB writes during agent streaming.
- **Discovery**: None.

### v0 / Phase 2 / Task 2.9 — Agent API Routes
- **Action**: Rewrote `app/api/agents/route.ts` with GET (list, filter by projectId/status) and POST (spawn with Zod validation). Created `app/api/agents/[id]/route.ts` (GET status, DELETE cancel). Created `app/api/agents/[id]/stream/route.ts` (SSE endpoint). Created `app/api/agents/[id]/resume/route.ts` (POST resume).
- **Outcome**: Full HTTP API for agent lifecycle.
- **Discovery**: None.

### v0 / Phase 2 / Task 2.10 — Background Process API Routes
- **Action**: Created `app/api/processes/route.ts` (GET list, POST start). Created `app/api/processes/[id]/route.ts` (GET status with live augmentation, DELETE stop). Created `app/api/processes/[id]/output/route.ts` (GET ring buffer content).
- **Outcome**: Full HTTP API for background process management.
- **Discovery**: None.

### v0 / Phase 2 / Task 2.11 — Agent Monitor UI
- **Action**: Created `components/agent-card.tsx` (status badge, model, turns, cost, cancel/resume/view buttons). Created `components/agent-output.tsx` (SSE EventSource consumer with terminal-like display, auto-scroll). Created `components/process-status.tsx` (background process panel with log viewer). Rewrote `/agents` page with running/recent sections. Updated `/projects/[id]` page: enabled agents tab, added per-project agent list with AgentCard, ProcessStatusPanel, and AgentOutput. Added phase start/approve/reject/skip buttons to phases tab.
- **Outcome**: Live agent monitoring UI with streaming output.
- **Discovery**: None.

### v0 / Phase 2 / Task 2.12 — Orchestrator
- **Action**: Created `lib/services/orchestrator.ts`. Phase flow: start (spawn agent with phase-specific prompt) → active → review → approve/reject/skip. Builds agent prompts from phase info + project context. Reads config from `process_configs` table (per-project or global defaults). Methods: startPhase, handlePhaseAction, markPhaseForReview, stopPhase.
- **Outcome**: Phase sequencing with approval gates.
- **Discovery**: None.

### v0 / Phase 2 / Task 2.13 — Electron Cleanup
- **Action**: Updated `electron/main.ts` before-quit handler. Stores Next.js server port in variable. On quit: sends POST to `/api/processes/shutdown` endpoint (8s timeout) then kills Next.js process. Created `app/api/processes/shutdown/route.ts` that calls AgentManager.cancel on all agents, BackgroundProcessManager.stopAll, and ProcessRegistry.shutdownAll.
- **Outcome**: Clean shutdown of all managed processes on app quit.
- **Discovery**: ChildProcess doesn't expose `.env` — need to store port separately.

### v0 / Phase 2 / Testing — 37 new tests (92 total)
- **Action**: Created `ring-buffer.test.ts` (8 tests: store/retrieve, wrapping, getLast, clear, high volume, timestamps). Created `process-registry.test.ts` (12 tests: register/unregister, getByProject/getByType, concurrency limits, events, shutdownAll). Created `schema.test.ts` (7 tests: agent_runs CRUD, nullable phaseId, cost tracking, filtering, background_processes, process_configs, deploy_events version_label). Created `orchestrator.test.ts` (5 tests: approve, approve with next phase, reject, skip, markPhaseForReview). Created `output-accumulator.test.ts` (4 tests: accumulate, threshold flush, interval flush, stop).
- **Outcome**: 92 tests passing (55 Phase 1 + 37 Phase 2).
- **Discovery**: Zod v4 mock factory cannot use `require()` — must use `vi.importActual()`.

### v0 / Phase 2 / Additional — StatusBadge updates
- **Action**: Added status styles for `cancelled`, `starting`, `stopped`, `review`, `feedback` to StatusBadge component.
- **Outcome**: All TAXONOMY.md statuses now have visual representation.
- **Discovery**: None.

### v0 / Phase 2 — Complete
- **Exit Criteria Met**:
  - ✅ HQ spawns Claude agents via SDK, streams output to UI in real-time
  - ✅ Background processes (dev server, test watcher, build watcher) managed with ring-buffered output
  - ✅ Agents pull background output via MCP tools (5 tools in HQ MCP Server)
  - ✅ User approves phase transitions (approve/reject/skip gates)
  - ✅ All processes cleaned up on app quit (shutdown endpoint + Electron before-quit)
  - ✅ Agent runs recorded in DB with session ID, cost, turns, output
  - ✅ 92 tests passing
- **Phase Feedback**:
  - ARCH.md still accurate — all component boundaries match PLAN.md design.
  - Zod v4 difference (`.issues` vs `.errors`) is minor — no doc update needed.
  - Agent SDK requires `allowDangerouslySkipPermissions: true` alongside `permissionMode: 'bypassPermissions'` — confirmed in SDK docs.
  - No orphaned TODOs or undocumented decisions.
  - PLAN.md remaining phases (3-5) still accurate — no scope changes discovered.

### v0 / Phase 2 / Post-Complete — Smoke test failures found and fixed
- **Action**: User reported "Generate Docs" button does nothing. Root cause analysis found two bugs:
  1. **`lucide-react` breaks client hydration**: Dependency was installed but a stale pnpm symlink in `apps/hq/node_modules/` caused Turbopack to fail client bundle compilation. React never hydrated, so all button click handlers were inert. Unit tests (Vitest/JSDOM) and typecheck both passed because they resolve modules differently than Turbopack.
  2. **Missing `ANTHROPIC_API_KEY` fails silently**: The generate endpoint threw inside an SSE stream. The client parsed the error event but only displayed it while `generating` was true — the error flashed for one render then vanished when `generating` was set to `false`.
- **Fixes applied**:
  - Removed stale app-level symlink, cleared `.next` cache
  - Added pre-flight API key check in generate route (returns 500 JSON before starting SSE)
  - Added `res.ok` check in client-side `handleGenerate`
  - Added proper SSE error event detection (tracks `event: error` line, captures next `data:` as error)
  - Added persistent `genError` state with visible error banner in UI
- **Outcome**: Error path now surfaces clearly. Button click either shows progress or a visible error.
- **Discovery**: **Unit tests with mocked dependencies are necessary but not sufficient.** Both bugs were invisible to Vitest (92 tests passed) and TypeScript (typecheck clean) but immediately visible to any user clicking a button. The Phase Feedback checklist did not require actually running the app.

## 2026-03-22

### v0 / Docs — Methodology pivot to "From Vision to Version Number"
- **Action**: Rewrote VISION.md, ARCH.md, PLAN.md, and TAXONOMY.md to adopt the 5-level decomposition methodology (Vision → Milestones → Architecture → Design → Tasks). VISION.md reframed as "0-to-$1 machine". ARCH.md gained planning vs delivery split, configurable collaboration depth (Operator/Architect/Full auto presets), orchestrator chat, and delivery-side ERD. PLAN.md restructured v0 around "build a mid-sized SaaS locally end-to-end" with new phases 3–6, moving deployment/monitoring/multi-project to v1+. TAXONOMY.md fully rewritten with new entity hierarchy, phase review states, skill types, and version numbering rules. Created DELIVERY_SCHEMA_AND_TRACKER_DETAILED_DESIGN.md for Phase 3.
- **Outcome**: All docs aligned on the new methodology. Detailed design ready for implementation.
- **Discovery**: Design docs need namespacing by phase (`docs/detailed_design/<Phase_Name>/`) to avoid filename collisions across milestones. Phase names should be descriptive and context-specific, not a fixed pattern.

### v0 / Phase 3 / Task 3.1 — Schema migration (milestones, phases, tasks, releases, release_milestones)
- **Action**: Added 5 new tables to `lib/db/schema.ts`: `milestones` (with MVP boundary flag), `phases` (with exit_criteria and review_result JSON columns), `tasks` (with source_doc reference), `releases` (semver + tag), `release_milestones` (composite PK join table). Added `vision_hypothesis` and `success_metric` columns to `projects`. Added `task_id` FK to `agent_runs` (nullable, keeps deprecated `phase_label`). Generated Drizzle migration `0001_cool_talkback.sql`.
- **Outcome**: 12 tables in schema. Migration applies automatically on startup.
- **Discovery**: Drizzle `primaryKey()` helper needed import from `drizzle-orm/sqlite-core` for composite PKs.

### v0 / Phase 3 / Task 3.4 — DeliveryTracker service
- **Action**: Created `lib/services/delivery-tracker.ts`. State machine for milestones (pending→active→completed/failed), phases (pending→active→reviewing→completed/review_failed), and tasks (pending→in_progress→completed/failed/skipped). Enforces valid transitions with typed errors. Cascade logic: task completion triggers phase review check, phase completion triggers milestone completion check. Methods: CRUD for all entities, setPhaseReviewResult, createFixUpTasks, resetPhaseForRework, extractTasksFromDesignDocs (parses `docs/detailed_design/*/` directory structure), getProjectDeliveryTree, getProjectProgress. Singleton on globalThis.
- **Outcome**: Full delivery-side state machine with cascade logic and task extraction.
- **Discovery**: None.

### v0 / Phase 3 / Task 3.5 — Task extraction from design docs
- **Action**: Implemented `extractTasksFromDesignDocs()` in DeliveryTracker. Globs `docs/detailed_design/*/` — each subdirectory becomes a phase (name derived from directory, underscores→spaces). Parses checkbox tasks (`- [ ] ...`) and table format tasks. Parses `## Exit Criteria` sections and stores as JSON on phase records.
- **Outcome**: Bridge between planning (workspace files) and delivery (DB records) functional.
- **Discovery**: None.

### v0 / Phase 3 / Task 3.8 — API routes (milestones, releases)
- **Action**: Created `app/api/projects/[id]/milestones/route.ts` (GET delivery tree, PATCH with Zod discriminated union for 8 actions: startTask, startPhase, approvePhase, rejectPhase, skipTask, retryTask, approveMilestone, getPhaseReview). Created `app/api/projects/[id]/releases/route.ts` (GET list with milestone IDs, POST create with optional publish + auto-generated build tag). Updated `app/api/agents/route.ts` with `taskId` in spawn schema.
- **Outcome**: Full HTTP API for delivery tracking and release management.
- **Discovery**: None.

### v0 / Phase 3 / Task 3.3 — agent_runs task_id linkage
- **Action**: Added `taskId` to AgentConfig type in `lib/process/types.ts`. Updated agent spawn route to accept and persist `taskId`. Existing `phaseLabel` kept for backwards compatibility.
- **Outcome**: Agent runs can now be linked to specific tasks.
- **Discovery**: None.

### v0 / Phase 3 / Testing — 29 new tests (160 total)
- **Action**: Created `lib/services/delivery-tracker.test.ts` with 29 tests covering: milestone CRUD + ordering + MVP boundary, phase CRUD + exit criteria, task CRUD + source_doc + getNextPendingTask, milestone status transitions (valid + invalid + retry), phase status transitions (full lifecycle + review_failed loop + invalid), task status transitions (complete + skip + retry + invalid), task→phase cascade (all complete→reviewing, skipped don't block, failed keeps active), phase→milestone cascade, phase review (store result, create fix-up tasks, force-approve), phase rejection (reset tasks), release operations (create + link + publish with tag), project delivery tree (nested structure + progress stats), task extraction from design docs (single dir, multiple dirs, missing dir).
- **Outcome**: 160 tests passing (131 existing + 29 new). TypeScript typecheck clean. 12 Playwright E2E tests pass.
- **Discovery**: None.

### v0 / Phase 3 — In Progress
- **Remaining tasks**: 3.2 (projects vision_hypothesis/success_metric population — columns exist, population deferred to Phase 4 planning skills), 3.7 (release stamping integration — API exists, orchestrator integration deferred), 3.9 (orchestrator rewrite to use DB — current orchestrator still uses PLAN.md parsing, full rewrite deferred until Phase 4 provides the planning pipeline that populates the delivery schema), 3.10 (additional integration tests for orchestrator + delivery tracker interaction).
- **Note**: The schema, delivery tracker, API routes, and tests are complete. The orchestrator rewrite (3.9) is intentionally deferred — the current orchestrator still works for existing projects, and the new delivery-tracker-based orchestrator needs the planning skills (Phase 4) to populate its data model. Implementing 3.9 now would create dead code with no way to exercise it.

### v0 / Phase 4 / Task 4.1 — Vision skill
- **Action**: Created `skills/vision/SKILL.md`. Extracts hypothesis + success metric from user prompt. Produces `docs/VISION.md` with tightly constrained format (1-3 sentences per section). Emphasizes falsifiable hypotheses and measurable success metrics with numbers and timeframes.
- **Outcome**: Vision skill ready for agent use.
- **Discovery**: None.

### v0 / Phase 4 / Task 4.2 — Milestone skill
- **Action**: Created `skills/milestones/SKILL.md`. Decomposes vision into ordered capability milestones with MVP boundary. Enforces milestones as user-visible capabilities, limits to 7 total, marks MVP boundary with `← MVP` suffix.
- **Outcome**: Milestone skill ready for agent use.
- **Discovery**: None.

### v0 / Phase 4 / Task 4.3 — Architecture skill update
- **Action**: Updated `skills/architecture/SKILL.md` with new "Per-Milestone Mode (Planning Engine)" section. Added: per-milestone scoping (output to `docs/milestones/<name>/`), delta-based output instructions, "Components Requiring Detailed Design" section requirement, "Roll-up Plan" section requirement, and canonical roll-up mode for merging deltas into `docs/ARCH.md` + `docs/arch/` after milestone completion.
- **Outcome**: Architecture skill supports both standalone use and planning engine integration.
- **Discovery**: None.

### v0 / Phase 4 / Task 4.4 — Design skill
- **Action**: Created `skills/design/SKILL.md`. Produces detailed design per component with interface (types/signatures only), Drizzle data model, happy path + error states, granular task checklist (`- [ ]` format), and objectively verifiable exit criteria. Outputs to `docs/detailed_design/<Phase_Name>/<component-name>.md`.
- **Outcome**: Design skill ready for agent use.
- **Discovery**: None.

### v0 / Phase 4 / Task 4.5 — Planning Engine service
- **Action**: Created `lib/services/planning-engine.ts`. Exports types: `SkillName`, `CollaborationProfile`, `PlanningEngineConfig`, `PlanningProgressEvent`, `SkillContext`, `SkillResult`, `PlanningResult`, `ParsedMilestone`. Pure functions: `parseMilestonesDoc()` (MVP boundary detection via `← MVP` suffix or section position), `parseArchComponentList()` (extracts bullet items from components section), `milestoneToArchDir()` (name-to-directory). `PlanningEngine` class with `runPipeline()` and `runSkill()`. Singleton on `globalThis`.
- **Outcome**: Planning engine spawns agents with skill prompts. `runSkill()` fully functional. `runPipeline()` spawns vision skill and returns.
- **Discovery**: `AgentManager.spawn()` is fire-and-forget — resolves when the agent starts, not when it finishes. Full sequential pipeline chaining requires completion callbacks not yet available. Noted with TODO.

### v0 / Phase 4 / Task 4.6 — Skill installer
- **Action**: Created `lib/services/skill-installer.ts`. `getSkillsSourceDir()` resolves skills path (dev: relative to repo root, Electron prod: `process.resourcesPath`). `installSkills()` copies all 4 skills into workspace, idempotent. `readSkillContent()` reads installed skill from workspace.
- **Outcome**: Skills can be installed into project workspaces and read back.
- **Discovery**: None.

### v0 / Phase 4 / Task 4.7 — Project creation flow update
- **Action**: Updated `components/project-form.tsx` to POST to `/api/projects/:id/plan` instead of `/api/projects/:id/generate`. Request body includes `collaborationProfile: "full_auto"`. SSE stream parsing updated to handle `event: progress` / `event: complete` / `event: error` format. Status messages updated to "Starting planning pipeline..." / "Planning...".
- **Outcome**: New project creation uses the planning engine. Old `/generate` endpoint kept for backwards compatibility.
- **Discovery**: None.

### v0 / Phase 4 / Task 4.8 — Bridge (partial)
- **Action**: `/api/projects/:id/plan` SSE endpoint created. `DeliveryTracker.extractTasksFromDesignDocs()` already exists from Phase 3. `runPipeline()` installs skills and spawns vision agent. Full sequential chaining (vision → parse → milestones → parse → architecture → design → extract tasks) deferred — requires agent completion callbacks.
- **Outcome**: Pipeline initiates but does not chain. Each skill can be run individually via `runSkill()`. Sequential orchestration is an orchestrator-rewrite concern (Phase 3.9/6).
- **Discovery**: The gap between "spawn agent" and "know when agent is done" is the key missing piece. The AgentManager's `finishAgent()` method updates the DB but has no callback mechanism. Adding an `onComplete` callback to AgentManager would unblock full pipeline chaining — this should be done as part of the orchestrator rewrite.

### v0 / Phase 4 / Task 4.9 — Tests
- **Action**: Created `lib/services/planning-engine.test.ts` with 23 tests: `parseMilestonesDoc` (5 tests: explicit MVP, fallback MVP, single milestone, empty, no section), `parseArchComponentList` (4 tests: h2 section, h3 section, missing, empty), `milestoneToArchDir` (2 tests: basic conversion, special chars), skill installer (4 tests: install all, idempotent, read content, read missing throws), prompt construction (3 tests: basic, milestone context, component context), PlanningEngine class (5 tests: runSkill spawns agent, prompt includes project prompt, handles spawn failure, runPipeline installs skills, runPipeline emits progress events).
- **Outcome**: 183 tests passing (160 Phase 3 + 23 Phase 4). TypeScript typecheck clean. 12 Playwright E2E pass.
- **Discovery**: None.

### v0 / Phase 4 — In Progress
- **Completed**: Tasks 4.1–4.7, 4.9. All skills created, planning engine functional, project creation flow updated, 23 new tests.
- **Remaining**: Task 4.8 (full pipeline chaining). The planning engine can run individual skills and initiate the pipeline, but cannot automatically chain vision → milestones → architecture → design → task extraction because `AgentManager.spawn()` is fire-and-forget with no completion callback. This is an orchestrator-rewrite concern — adding `onComplete` to AgentManager will unblock it.
- **Note**: The old `/generate` endpoint and doc generator are kept for backwards compatibility. The `/plan` endpoint is the new default. Skills are installable and improvable independently as designed.
