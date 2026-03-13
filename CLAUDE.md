# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

AutEng HQ — a local-first Electron + Next.js desktop app that orchestrates AI agent-operated businesses. It transforms a user prompt into a running, monitored product by managing project planning, agent execution, cloud deployment, and KPI tracking.

## Commands

```bash
# Install dependencies
pnpm install

# Development (browser only)
pnpm dev

# Development (Electron with hot reload)
pnpm --filter auteng-hq dev:electron

# Production build
pnpm build

# Electron .dmg build
pnpm --filter auteng-hq build:electron

# Code quality
pnpm lint
pnpm typecheck
pnpm --filter auteng-hq format

# Database (after schema changes in apps/hq/lib/db/schema.ts)
cd apps/hq && npx drizzle-kit generate && npx drizzle-kit push
```

## Architecture

**Monorepo** (pnpm workspaces + Turborepo):
- `apps/hq/` — Main app (Next.js 16 App Router + Electron 40)
- `packages/shared/` — Shared types (stub, `@auteng/shared`)
- `docs/` — AutEng workflow documents (VISION, ARCH, PLAN, TAXONOMY, etc.)

**Electron architecture**: Main process (`electron/main.ts`) spawns Next.js standalone server as a child process, then loads it in a BrowserWindow with context-isolated preload bridge (`electron/preload.ts`). IPC is minimal: `app:minimize`, `app:maximize`, `app:close`.

**Database**: SQLite via better-sqlite3 + Drizzle ORM. Schema in `apps/hq/lib/db/schema.ts`, connection singleton in `apps/hq/lib/db/index.ts`. WAL mode, foreign keys enforced. Tables: `projects`, `phases`, `agentTasks`, `kpiSnapshots`, `deployEvents`.

**UI**: shadcn/ui (radix-maia style, taupe base) + Tailwind CSS v4 with OKLch tokens defined in `apps/hq/app/globals.css`. Component registry metadata in `apps/hq/components/registry/`. Living design system at `/design-system` route (dev-only).

**API routes** in `apps/hq/app/api/` — currently scaffolds for projects, agents, deploys.

## AutEng Workflow (Document-Driven Development)

The project follows a doc-driven methodology. Core docs in `docs/`:
- **WORKFLOW.md** — Session protocol, document ownership, feedback process
- **ARCH.md** — System design, schema, component boundaries
- **PLAN.md** — Phased implementation with exit criteria
- **TAXONOMY.md** — Canonical names, statuses, enums, naming conventions
- **CODING-STANDARDS.md** — Code style, security, testing rules
- **DESIGN_SYSTEM.md** — Token architecture, component registry

**Read order for context**: WORKFLOW → CODING-STANDARDS → DESIGN_SYSTEM → TAXONOMY → ARCH → PLAN → VISION → logs

Two append-only logs: `PLAN_PROGRESS_LOG.md` (task completions, discoveries) and `WORKFLOW_AUDIT.md` (orchestrator actions, agent spawns, deploys).

## Code Conventions

- TypeScript strict mode, no `any` — use `unknown` and narrow
- Named exports only (no default exports)
- One component per file
- Colocate tests: `foo.ts` → `foo.test.ts`
- Prefer early returns over nested conditionals
- No classes unless wrapping a stateful resource
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Path alias: `@/*` maps to `apps/hq/*`

## Naming Conventions

- DB columns: `snake_case`
- TS types/interfaces: `PascalCase`
- TS variables/functions: `camelCase`
- API routes: `kebab-case`
- File names: `kebab-case`
- Env variables: `SCREAMING_SNAKE_CASE`

## Key Statuses (from TAXONOMY.md)

- **Project**: draft → planning → building → deployed → paused → archived
- **Phase**: pending → active → review → feedback → completed → failed
- **Agent Run**: queued → running → completed → failed → cancelled
- **Deploy**: pending → building → live → failed → rolled_back
