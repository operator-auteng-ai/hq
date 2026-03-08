# AutEng HQ — Desktop App

Electron + Next.js 16 desktop app for launching, orchestrating, and monitoring AI-agent-operated businesses.

## Prerequisites

- Node.js >= 20
- pnpm >= 10
- macOS (for .dmg builds)

## Development

Install dependencies from the **monorepo root**:

```bash
cd ../..   # monorepo root
pnpm install
```

All commands below can be run from either the monorepo root or this directory (`apps/hq/`).

### Browser-only (Next.js)

```bash
pnpm dev
```

Opens at [http://localhost:3000](http://localhost:3000).

### Electron + Next.js

```bash
pnpm dev:electron
```

Compiles the Electron main process, starts the Next.js dev server, and opens the app in an Electron window with hot reload.

## Build

### Production .dmg (macOS)

```bash
pnpm build:electron
```

This runs the full pipeline:

1. `next build` — compiles the Next.js app in standalone mode
2. `tsc -p electron/tsconfig.json` — compiles the Electron main process
3. `scripts/electron-prep.sh` — prepares the standalone output for Electron packaging (deferences symlinks, merges and completes node_modules)
4. `electron-builder --mac` — packages into signed `.dmg` (arm64 + x64)

Output: `release/AutEng HQ-0.0.1-arm64.dmg` and `release/AutEng HQ-0.0.1.dmg`

### Install & Run

Open the `.dmg`, drag to `/Applications`, then launch **AutEng HQ** from the dock or Spotlight.

## Database

SQLite via Drizzle ORM. The database file is created automatically at `data/hq.db` on first run with WAL mode and foreign keys enabled.

To regenerate migrations after schema changes:

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

## Project Layout

```
├── app/                  # Next.js App Router pages and API routes
│   ├── api/              # REST endpoints (projects, agents, deploys)
│   └── design-system/    # Living design system (tokens, components)
├── components/
│   ├── registry/         # Component registry (types, entries, helpers)
│   └── ui/               # shadcn/ui v4 components
├── electron/
│   ├── main.ts           # Electron main process
│   ├── preload.ts        # Context bridge (IPC, platform info)
│   └── tsconfig.json     # Compiles to CommonJS → dist-electron/
├── lib/
│   └── db/               # Drizzle schema and singleton connection
├── scripts/
│   └── electron-prep.sh  # Standalone → Electron packaging prep
└── public/               # Static assets
```

## Design System

Available at `/design-system` in the running app:

- **Tokens** — color, typography, spacing, radius, shadow
- **Components** — grouped by atomic level (atom, molecule, component)
