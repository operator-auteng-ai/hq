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
