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
