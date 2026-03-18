# WORKFLOW AUDIT — AutEng HQ

## 2026-03-07

### doc-setup — Established workflow documentation
- **Actor**: user + orchestrator
- **Action**: Created all foundational docs (VISION, ARCH, PLAN, TAXONOMY, CODING-STANDARDS, WORKFLOW)
- **Reason**: Project bootstrap — following AutEng workflow
- **Affected**: AutEng HQ / v0 / Pre-Phase

### doc-restructure — Introduced work unit hierarchy and feedback loops
- **Actor**: user + orchestrator
- **Action**: Established Project → Version → Phase → Task hierarchy. Added Feedback Engine to ARCH. Created WORKFLOW.md with feedback stages. Restructured PLAN.md with task-level breakdown.
- **Reason**: Needed formal hierarchy for both HQ development and managed projects. Feedback loops ensure docs stay accurate.
- **Affected**: AutEng HQ / v0 / Pre-Phase

### doc-rename — Split logging into PLAN_PROGRESS_LOG and WORKFLOW_AUDIT
- **Actor**: user + orchestrator
- **Action**: Renamed PROGRESS_LOG.md → PLAN_PROGRESS_LOG.md (tracks progress against plan). Created WORKFLOW_AUDIT.md (tracks orchestrator decisions). Removed task-level doc files from directory structure (covered by versioning).
- **Reason**: Separation of concerns — plan progress vs orchestrator decisions need distinct audit trails
- **Affected**: AutEng HQ / v0 / Pre-Phase

## 2026-03-15

### phase-complete — Phase 1 (Project Creation) completed
- **Actor**: user + orchestrator
- **Action**: Implemented all 6 Phase 1 tasks (1.1–1.6). Created project CRUD API, doc generator service, workspace creation, new project UI, project list view, and project detail view. Phase feedback checklist completed — all exit criteria met.
- **Reason**: Phase 1 scope complete per PLAN.md exit criteria
- **Affected**: AutEng HQ / v0 / Phase 1

### dependency-added — @anthropic-ai/sdk for doc generation
- **Actor**: orchestrator
- **Action**: Added `@anthropic-ai/sdk` as dependency for doc generator service. This is the Anthropic API SDK (for direct API calls), distinct from `@anthropic-ai/claude-agent-sdk` (for agent orchestration in Phase 2).
- **Reason**: Doc generation requires Claude API calls to transform prompts into structured workflow documents
- **Affected**: AutEng HQ / v0 / Phase 1 / Task 1.3

## 2026-03-16

### phase-complete — Phase 2 (Agent Execution) completed
- **Actor**: user + orchestrator
- **Action**: Implemented all 13 Phase 2 tasks (2.1–2.13). Created process management layer (ProcessRegistry, AgentManager, BackgroundProcessManager, HQ MCP Server), agent API routes with SSE streaming, background process API routes, Agent Monitor UI, Orchestrator with approval gates, and Electron cleanup. 37 new tests added (92 total).
- **Reason**: Phase 2 scope complete per PLAN.md exit criteria
- **Affected**: AutEng HQ / v0 / Phase 2

### dependency-added — @anthropic-ai/claude-agent-sdk for agent execution
- **Actor**: orchestrator
- **Action**: Added `@anthropic-ai/claude-agent-sdk@^0.2.76` as dependency for agent spawning via SDK `query()` API. Also added `uuid@^13.0.0` for process/agent ID generation. Added agent SDK to `serverExternalPackages` in `next.config.mjs`.
- **Reason**: Agent execution requires programmatic Claude Code spawning with streaming, abort, resume, and MCP injection
- **Affected**: AutEng HQ / v0 / Phase 2 / Task 2.1

### schema-migration — Replaced agentTasks with agentRuns, added new tables
- **Actor**: orchestrator
- **Action**: Replaced `agent_tasks` table with `agent_runs` (expanded schema with project_id, session_id, model, prompt, cost/turn tracking). Added `background_processes` and `process_configs` tables. Added `version_label` to `deploy_events`.
- **Reason**: Phase 2 requires multi-agent support with project-level scoping, background process tracking, and configurable concurrency limits
- **Affected**: AutEng HQ / v0 / Phase 2 / Task 2.2

### feedback-run — Phase 2 feedback checklist completed
- **Actor**: orchestrator
- **Action**: Reviewed all Phase 2 PLAN_PROGRESS_LOG entries. Verified ARCH.md accuracy (all component boundaries match implementation). Updated PLAN.md current state and marked Phase 2 complete. Updated StatusBadge for new statuses. No doc updates needed — architecture held as designed.
- **Reason**: Phase feedback per WORKFLOW.md protocol
- **Affected**: AutEng HQ / v0 / Phase 2

### bugfix — Smoke test failures: hydration + silent error
- **Actor**: user + orchestrator
- **Action**: User discovered "Generate Docs" button was inert. Two bugs found: (1) stale pnpm symlink broke Turbopack client bundle compilation, preventing React hydration — all buttons were non-functional, (2) missing ANTHROPIC_API_KEY error was swallowed by SSE stream parsing. Fixed both: removed stale symlink, added pre-flight API key check, added proper error state and error banner in UI.
- **Reason**: Phase 2 was marked complete without running the app in a browser. 92 unit tests and typecheck passed but did not cover runtime module resolution or real user interaction.
- **Affected**: AutEng HQ / v0 / Phase 1 (generate endpoint) + Phase 2 (lucide-react dep)

### doc-update — Added Smoke Test Protocol to WORKFLOW.md and CODING-STANDARDS.md
- **Actor**: orchestrator
- **Action**: Added "Smoke Test Protocol" section to WORKFLOW.md (6-step process: start dev server, load pages, click buttons, check console, test error paths, curl APIs). Added smoke test requirement to Phase Feedback checklist. Updated CODING-STANDARDS.md Definition of Done to require dev server compilation, browser rendering, and error path verification. Updated Testing section to require smoke tests and error path coverage.
- **Reason**: The Phase Feedback checklist lacked a "does the app actually work" verification step. Two bugs shipped past 92 passing tests and clean typecheck because neither covers browser-level functionality.
- **Affected**: AutEng HQ / docs (WORKFLOW.md, CODING-STANDARDS.md)
