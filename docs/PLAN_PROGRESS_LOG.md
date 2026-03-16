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
