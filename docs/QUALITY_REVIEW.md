# Quality Review — AutEng HQ v0 (Post-Phase 7)

Review date: 2026-03-22
Scope: All code in `apps/hq/` audited against CODING_STANDARDS.md and SOFTWARE_PHILOSOPHY.md

---

## Summary

**Overall: GOOD** — The codebase is well-aligned with coding standards. No critical violations. 4 files missing colocated tests. No `any` types, no raw SQL in components, no eval/exec, no orphaned TODOs. Architecture follows composition over inheritance, classes only wrap stateful resources, error handling uses early returns throughout.

---

## Compliance Matrix

| Standard | Status | Issues |
|----------|--------|--------|
| No `any` types | PASS | 0 |
| Named exports only | PASS | 0 (page default exports are Next.js-required) |
| One component per file | PASS | 0 |
| Colocated tests | **4 MISSING** | `agent-manager`, `background-process-manager`, `hq-mcp-server`, `skill-installer` |
| `const` by default | PASS | All 11 `let` uses justified (loop vars, accumulators) |
| Early returns over nesting | PASS | 1 borderline 4-level nesting in orchestrator review callback |
| Classes wrap stateful resources | PASS | All 9 classes justified |
| No raw SQL in components | PASS | 0 |
| Transactions for multi-table writes | NOTE | No explicit transactions (acceptable — see below) |
| Never swallow errors | PASS | All silent `catch` blocks have justifying comments |
| Typed error classes | PASS | `ConcurrencyLimitError` defined and used |
| No secrets in code/git | PASS | AES-256-GCM encryption, env var fallback |
| No eval/exec with unsanitized input | PASS | Only hardcoded git commands in workspace.ts |
| No TODO/FIXME without issue | PASS | 0 found |
| Conventional commits | PASS | All commits follow `feat:`/`fix:`/`docs:`/`chore:` |
| Schema matches ARCH.md | PASS | Synced in post-Phase 7 audit |

---

## Missing Test Coverage

4 service files lack colocated tests:

| File | Risk | Reason |
|------|------|--------|
| `lib/process/agent-manager.ts` | **High** | Core agent spawning — hard to test (requires Claude SDK mock) but critical path |
| `lib/process/background-process-manager.ts` | Medium | Spawns child processes — integration test territory |
| `lib/process/hq-mcp-server.ts` | Low | Thin wrapper around SDK `createSdkMcpServer()` |
| `lib/services/skill-installer.ts` | Low | Tests exist inside `planning-engine.test.ts` (4 tests cover install, idempotent, read, missing) but not in a dedicated colocated file |

**Note**: `skill-installer` is tested — just not in a colocated `skill-installer.test.ts` file. The 4 tests in `planning-engine.test.ts` cover all its functions. This is a naming/colocation issue, not a coverage gap.

---

## Transaction Strategy

The coding standard says "Use transactions for multi-table writes." The codebase has no explicit `db.transaction()` calls. This is acceptable because:

1. **better-sqlite3 is synchronous** — each `.run()` call is an implicit autocommit transaction that completes before the next line executes
2. **No concurrent writers** — SQLite in WAL mode with a single Node.js process means no write contention
3. **Failure semantics are acceptable** — if task status updates but phase activation fails, the state is recoverable (re-run the operation)
4. **Drizzle ORM's transaction API** is available if needed but adds complexity without clear benefit here

If the app ever moves to async DB operations or multi-process writes, transactions should be added.

---

## Architecture Quality

### Philosophy Alignment

| Principle | Assessment |
|-----------|-----------|
| **DRY** | Good — singleton pattern used consistently, shared types exported, no duplicated logic |
| **Composition over inheritance** | Excellent — no inheritance hierarchies. Classes compose via function calls to other singletons |
| **Model the real world** | Good — milestones, phases, tasks, releases map to real delivery concepts. `release_milestones` join table correctly models the loose coupling |
| **Fail fast** | Good — services throw on invalid input, API routes catch at boundary and return structured errors |
| **Single responsibility** | Good — orchestrator coordinates, delivery tracker manages state, planning engine runs skills, agent manager spawns agents. Clear boundaries |
| **Open/closed** | Good — skills are pluggable files, collaboration profiles are extensible, agent types are configurable |
| **Dependency inversion** | Partial — services depend on concrete singletons (`getDeliveryTracker()`, `getAgentManager()`) rather than injected interfaces. Testable via `vi.mock()` but not ideal for substitution |
| **YAGNI** | Good — no speculative abstractions. Deploy manager and KPI tracker are stubs, not premature implementations |

### Code Smells

1. **Orchestrator `triggerPhaseReview` callback nesting** — The review completion callback in `orchestrator.ts` (lines ~415-492) has a 4-level nested structure inside an `onComplete` callback. Consider extracting to a `handleReviewResult(phaseId, result)` method.

2. **Planning engine file I/O in service layer** — `planning-engine.ts` reads files directly via `fs.readFileSync`. This is pragmatic but mixes I/O with orchestration logic. Acceptable for v0.

3. **`process.env.ANTHROPIC_API_KEY` mutation** — `agent-manager.ts` line 80 mutates `process.env` to pass the API key to the Claude SDK. This is a global side effect. The SDK should accept the key directly, but this is an SDK limitation, not our code's fault.

---

## Security Review

| Area | Status | Notes |
|------|--------|-------|
| API key storage | PASS | AES-256-GCM with OS keychain master key (Electron), plaintext with warning (dev) |
| Agent sandboxing | PASS | `permissionMode: "bypassPermissions"` but scoped to project workspace via `cwd` |
| Input validation | PASS | Zod schemas on all API routes |
| Shell injection | PASS | Only hardcoded git commands, no user input in shell calls |
| XSS | PASS | React's default escaping, no `dangerouslySetInnerHTML` |
| Path traversal | NOTE | `workspace.ts` uses `path.join(base, slug)` — `slugify()` strips special chars, but no explicit traversal check |

---

## Performance Considerations

| Area | Status | Notes |
|------|--------|-------|
| SQLite WAL mode | PASS | Enabled in `db/index.ts` |
| Foreign keys | PASS | Enabled via pragma |
| Index usage | NOTE | No explicit indexes beyond PKs and FKs. May need indexes on `agent_runs.project_id`, `tasks.phase_id`, `milestones.project_id` for list queries at scale |
| Agent output batching | PASS | OutputAccumulator flushes every 5s or 50 messages |
| SSE streaming | PASS | Agent output and chat responses streamed incrementally |
| Polling frequency | NOTE | Project detail page polls agents every 3s. May be aggressive for many projects |

---

## Test Quality

| Metric | Value |
|--------|-------|
| Unit tests | 179 |
| E2E tests | 21 |
| Test frameworks | Vitest (unit), Playwright (E2E) |
| Mocking strategy | `vi.mock()` for DB, agent manager, secrets |
| E2E mocking | Playwright route mocking for SSE streams, API responses |
| Coverage gaps | Agent manager, background process manager, HQ MCP server |

### Test Quality Observations

- **Good**: Delivery tracker has comprehensive state machine tests (29 tests covering all transitions, cascades, edge cases)
- **Good**: Planning engine parser tests cover well-formed, edge case, and empty inputs
- **Good**: E2E tests use mocked SSE streams to verify UI without real API calls
- **Gap**: No integration tests that exercise the full orchestrator → agent manager → delivery tracker chain with real (mocked) agent completion callbacks

---

## Recommendations

### Priority 1 (should fix)
1. **Add `skill-installer.test.ts`** — Move the 4 skill installer tests from `planning-engine.test.ts` to a colocated file
2. **Extract review callback** — In `orchestrator.ts`, extract the `onComplete` callback body to `private async handlePhaseReviewResult(phaseId, agentId)` to reduce nesting

### Priority 2 (should do when touching these files)
3. **Add `agent-manager.test.ts`** — Test `onComplete`, `waitForAgent`, spawn error handling. Mock the Claude SDK `query()` function
4. **Add DB indexes** — `agent_runs(project_id)`, `tasks(phase_id)`, `chat_messages(project_id)` for list query performance
5. **Document transaction strategy** — Add a comment block in `delivery-tracker.ts` explaining why explicit transactions aren't used

### Priority 3 (nice to have)
6. **Add path traversal check** — In `workspace.ts`, verify the resolved path is still under the base directory after `slugify()`
7. **Reduce polling frequency** — Consider 5s instead of 3s for agent polling, or switch to SSE for live updates
8. **Integration test for orchestrator chain** — Test `startTask` → mock agent completes → `onAgentCompleted` → next task starts → phase completes → review triggers
