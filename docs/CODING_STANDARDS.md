# CODING STANDARDS — AutEng HQ

## Language & Runtime

- TypeScript everywhere (strict mode)
- Node.js for Electron main process and backend services
- React for all UI (HQ and mobile)
- No `any` types — use `unknown` and narrow

## Project Structure

```
project-root/
  apps/
    hq/                       # Next.js + Electron desktop app
      app/                    # Next.js app router
        globals.css           # Token definitions (L2 primitives, L3 semantic)
        design-system/        # Living design system (dev-only)
        api/                  # API routes (projects, agents, deploys)
      components/
        ui/                   # shadcn primitives (atom level)
        registry/             # Component registry metadata
      electron/               # Electron main process + preload
      lib/
        db/                   # Drizzle ORM schema + connection
        utils.ts              # cn() utility
      hooks/                  # Custom hooks
      drizzle/                # DB migrations
  packages/
    shared/                   # Shared types and utilities
  docs/                       # AutEng workflow docs
```

See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for the full component registry, token architecture, and design system route structure.

## Code Style

- Use named exports, not default exports
- One component per file
- Colocate tests with source: `foo.ts` → `foo.test.ts`
- Use `const` by default, `let` only when reassignment is needed
- Prefer early returns over nested conditionals
- No classes unless wrapping a stateful resource (DB, process)

## State Management

- React Server Components for static/fetched data
- `useState` / `useReducer` for local UI state
- Zustand for shared client state (if needed)
- No Redux

## Database

- SQLite via `better-sqlite3` or Drizzle ORM
- All queries go through a repository layer — no raw SQL in components
- Migrations versioned and committed
- Use transactions for multi-table writes
- Schema defined in ARCH.md — code must match

## Error Handling

- Never swallow errors silently — if an operation fails, the user must see why
- Agent process failures must be captured and stored in `agent_runs.output`
- Use typed error classes for distinct failure modes
- User-facing errors must be actionable ("Deploy failed: invalid API key" not "Something went wrong")
- Pipeline and agent errors must surface the root cause to the user via chat system messages, not just log to the server console
- Transient failures (API errors, rate limits, network issues) must retry with exponential backoff before reporting failure
- Validate inputs (API keys, config) before starting expensive operations — fail fast with a clear message

## Security

- No secrets in code or git — use environment variables
- Agent processes run with minimal permissions
- Sanitize all user input before passing to shell commands
- No `eval()` or `child_process.exec()` with unsanitized input — use `execFile` or `spawn` with argument arrays
- WebSocket connections require authentication token

## Testing

- Unit tests for business logic (orchestrator, agent manager, doc generator)
- Integration tests for agent spawning and DB operations
- E2E smoke tests via Playwright (`pnpm --filter auteng-hq test:e2e`) — pages render, buttons work, errors surface
- Test frameworks: Vitest (unit/integration), Playwright (E2E smoke)
- Target: critical paths covered, not 100% line coverage
- **Smoke tests are mandatory** — unit tests with mocked deps are insufficient. See WORKFLOW.md Smoke Test Protocol
- Every user-facing error path must be tested (missing env vars, network failures, invalid input)
- API route tests must verify actual HTTP responses, not just service-layer logic

## Performance

- SQLite queries must use indexes for any list/filter operation
- Agent output streaming must not block the UI (use IPC properly)
- Dashboard must render 10+ projects without lag
- Lazy load project details — don't fetch all data upfront

## Git & Commits

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- One logical change per commit
- All code must pass lint + type check before commit

## Definition of Done

A task is done when:
1. Code is written and type-checks (`tsc --noEmit`)
2. Tests pass (`npm test`)
3. Lint passes (`npm run lint`)
4. Dev server starts without compilation errors (`pnpm dev`)
5. New/modified pages render in the browser and buttons respond to clicks
6. Error paths show clear, actionable messages (not silent failures)
7. Feature works in the Electron app (not just browser)
8. No `TODO` or `FIXME` left without a linked issue
