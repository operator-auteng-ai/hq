# AutEng HQ

Desktop command center for launching, orchestrating, and managing businesses built and operated by AI agents. You provide a starting prompt — HQ turns it into a running business.

## What It Does

1. **Prompt** — Describe what you want to build
2. **Plan** — HQ generates workflow docs (VISION, ARCH, PLAN, TAXONOMY, CODING-STANDARDS)
3. **Build** — Dev agents (Claude Code, Codex CLI) implement each phase autonomously
4. **Deploy** — Orchestrate cloud deployment (Vercel, AWS)
5. **Monitor** — Track KPIs, logs, errors, and business metrics from the dashboard

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| UI framework | Next.js 16 (React 19, App Router) |
| Styling | Tailwind CSS v4, shadcn/ui v4 |
| Database | SQLite (Drizzle ORM) |
| Language | TypeScript (strict) |
| Monorepo | Turborepo + pnpm |

## Project Structure

```
├── apps/
│   └── hq/                  # Next.js + Electron desktop app
│       ├── app/             # Pages, API routes, design system
│       ├── components/      # UI components + registry
│       ├── electron/        # Electron main process
│       └── lib/             # DB, utilities
├── packages/
│   └── shared/              # Shared types and utilities
└── docs/                    # Workflow documents (VISION, ARCH, PLAN, etc.)
```

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 10

### Install

```bash
pnpm install
```

### Development

Run the Next.js app in the browser:

```bash
pnpm dev
```

Run inside Electron with hot reload:

```bash
cd apps/hq
pnpm dev:electron
```

### Build

Production .dmg (macOS):

```bash
cd apps/hq
pnpm build:electron
```

Output goes to `apps/hq/release/`.

### Database

The SQLite database is created automatically at `apps/hq/data/hq.db` on first run. To regenerate migrations after schema changes:

```bash
cd apps/hq
npx drizzle-kit generate
npx drizzle-kit push
```

## Design System

A living design system is available at `/design-system` in the running app, with:

- **Tokens** — Colors, typography, spacing, shadows, radii
- **Components** — Atoms, molecules, and components with registry metadata

## Documentation

All project documentation lives in `docs/` following the [AutEng workflow](docs/WORKFLOW.md):

- [VISION.md](docs/VISION.md) — Product scope and success metrics
- [ARCH.md](docs/ARCH.md) — System architecture and database schema
- [PLAN.md](docs/PLAN.md) — Phased implementation plan
- [CODING-STANDARDS.md](docs/CODING-STANDARDS.md) — Code style and quality rules
- [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — Token architecture and component registry
- [TAXONOMY.md](docs/TAXONOMY.md) — Shared vocabulary and naming conventions

## License

Free and open source. HQ itself costs nothing. Users pay for the services agents consume (AI APIs, cloud hosting, compute).
