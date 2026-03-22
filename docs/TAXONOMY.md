# TAXONOMY — AutEng HQ

## Work Unit Hierarchy

HQ follows the [From Vision to Version Number](./from-vision-to-version-number.html) methodology. Planning is top-down (decomposition), delivery is bottom-up (execution).

```
Planning (top-down):     Vision → Milestones → Architecture → Design → Tasks
Delivery (bottom-up):    Tasks → Phases → Milestones → Releases
```

### Planning Entities

Planning artifacts are workspace files produced by skills and versioned by git.

| Term | Definition | NOT |
|------|-----------|-----|
| **Vision** | A hypothesis about what should exist, with a concrete success metric. Stored in `VISION.md`. Above version numbers entirely — it answers *why this project exists* | A feature list or PRD |
| **Milestone** | A capability checkpoint that tests the vision hypothesis. Answers "what can the user do now that they couldn't before?" Stored in `MILESTONES.md`. The MVP boundary defines which milestones constitute v1.0 | A release (milestones define *what's done*, releases define *what ships*) |
| **Architecture** | The components a milestone needs and how they connect. Scoped per milestone — the architecture evolves as milestones land. Stored in `ARCH.md` | A full system design (architecture is revealed incrementally, not designed all at once) |
| **Design** | Detailed specification of a single component: interfaces, data models, error states. The last planning artifact before code. Stored under `docs/detailed_design/<Phase_Name>/<component>.md` | Implementation code (design shows contracts and boundaries, not internals) |

### Delivery Entities

Delivery artifacts are tracked in HQ's SQLite database.

| Term | Definition | NOT |
|------|-----------|-----|
| **Project** | A self-contained product managed by HQ, created from a vision prompt. Has a workspace (git repo), milestones, and releases | A git repo (a project *has* a workspace which is a repo) |
| **Milestone** (DB) | A capability checkpoint record in the database, mirroring the planning milestone. Tracks status, ordering, and MVP boundary flag | A release (milestones and releases are loosely coupled via a join table) |
| **Phase** | A coherent stage of work within a milestone. Groups related tasks. Phase names are descriptive and context-specific (e.g., "Data Model & API", "Payment Flow", "Schema Migration"). Each phase has exit criteria and undergoes automated review before completion | A milestone (phases are smaller units within a milestone). Not a fixed pattern — names describe what the phase accomplishes |
| **Task** | An individual work item within a phase, derived from a design document. The atomic unit of work that an agent executes. Linked back to its source design doc | A user story or ticket (tasks are structured artifacts in a decomposition methodology, not a backlog) |
| **Release** | A version-stamped shipment following semver. Loosely coupled to milestones — a release may span parts of multiple milestones, or one milestone may have multiple releases | A milestone (releases define *what ships with what compatibility promises*, milestones define *what's done*) |

### Other Core Entities

| Term | Definition | NOT |
|------|-----------|-----|
| **Prompt** | The starting natural-language description that seeds a project's vision | An ongoing chat (it's a one-shot input that kicks off decomposition) |
| **Workspace** | The local git repository where a project's code and planning docs live | The HQ app itself |
| **Skill** | A structured prompt installed into agent workspaces that encodes domain expertise for a decomposition level (vision, milestones, architecture, design). Stored in `skills/<name>/SKILL.md` | A plugin or extension (skills are prompt templates, not executable code) |
| **Dev Agent** | An AI agent instance spawned via Claude Agent SDK `query()`. Scoped to a project workspace, ephemeral. Linked to a specific task via `task_id` | A service or daemon (agents are ephemeral, not long-lived) |
| **Phase Review** | An automated review step at the end of each phase. A review agent checks exit criteria, runs tests, and reviews code changes. Produces a structured pass/fail result. Failed reviews generate fix-up tasks | A user approval gate (review is automated; the user can override but doesn't have to act) |
| **Collaboration Profile** | Configurable setting that controls which decomposition levels pause for user review vs. proceed autonomously. Presets: Operator, Architect, Full auto | A permission level (it controls workflow pauses, not access) |
| **Background Process** | A long-lived support process (dev server, test watcher, build watcher) spawned by HQ or an agent for a project | An agent (background processes don't do AI work, they provide runtime services) |
| **Deployment** | A built project pushed to a cloud platform | Running locally (that's a "local run") |
| **KPI** | A quantitative business or health metric tracked over time | A log entry (KPIs are aggregated, logs are raw) |

## Statuses

### Project Status

| Value | Meaning |
|-------|---------|
| `draft` | Created, vision being generated |
| `planning` | Decomposition in progress (skills running through levels) |
| `building` | Agents actively implementing tasks |
| `deployed` | Live in production |
| `paused` | User paused all activity |
| `archived` | No longer active |

### Milestone Status

| Value | Meaning |
|-------|---------|
| `pending` | Not yet started |
| `active` | At least one phase is being executed |
| `completed` | All phases completed |
| `failed` | Unrecoverable failure, needs intervention |

### Phase Status

| Value | Meaning |
|-------|---------|
| `pending` | Not yet started |
| `active` | Tasks being executed |
| `reviewing` | All tasks completed, review agent checking exit criteria |
| `review_failed` | Review agent found unmet exit criteria — fix-up tasks will be created |
| `completed` | Review passed (or user force-approved) |
| `failed` | Unrecoverable task failure, needs intervention |

### Task Status

| Value | Meaning |
|-------|---------|
| `pending` | Not yet started |
| `in_progress` | Agent assigned and working |
| `completed` | Agent finished successfully |
| `failed` | Agent failed, can be retried |
| `skipped` | User skipped this task |

### Agent Run Status

| Value | Meaning |
|-------|---------|
| `queued` | Waiting to be picked up |
| `running` | Agent process active |
| `completed` | Finished successfully (exit code 0) |
| `failed` | Process errored (exit code != 0) |
| `cancelled` | Killed by user or orchestrator |

### Release Status

| Value | Meaning |
|-------|---------|
| `pending` | Release created, not yet published |
| `published` | Release stamped and available |
| `failed` | Release process failed |

### Background Process Status

| Value | Meaning |
|-------|---------|
| `starting` | Process spawned, waiting for readiness |
| `running` | Process active and healthy |
| `stopped` | Gracefully shut down |
| `failed` | Process exited unexpectedly |

### Deploy Status

| Value | Meaning |
|-------|---------|
| `pending` | Deploy initiated |
| `building` | Platform building the project |
| `live` | Successfully deployed |
| `failed` | Deploy errored |
| `rolled_back` | Reverted to previous version |

## Version Numbering

Follows semver, mapped to the decomposition methodology:

| Segment | Meaning | Maps to |
|---------|---------|---------|
| **major** | Broke the public contract (API, schema, auth) | Architectural epoch shift |
| **minor** | New capability shipped | Often aligns with a milestone completion |
| **patch** | Fix within a milestone | One or a few tasks |
| **date-commit** | Build metadata for CI/CD traceability | Nothing in planning — it's a delivery artifact |

Pre-MVP milestones are `0.x.0` (M1 = 0.1.0, M2 = 0.2.0). MVP completion = `1.0.0`. Post-MVP milestones = `1.1.0`, `1.2.0`, etc.

## Collaboration Profiles

| Preset | Collaborative at | Autonomous at | Best for |
|--------|-----------------|---------------|----------|
| `operator` | Vision, Milestones | Architecture, Design, Delivery | Product managers, non-technical founders |
| `architect` | Vision, Milestones, Architecture, Design | Delivery | Engineers |
| `full_auto` | Vision | Milestones, Architecture, Design, Delivery | Maximum speed |

## Agent Types

| Value | Tool | Use Case |
|-------|------|----------|
| `claude_code` | Claude Code CLI | Primary dev agent |
| `codex_cli` | OpenAI Codex CLI | Alternative dev agent |
| `custom` | User-defined | Extended integrations |

## Skill Types

| Value | Decomposition Level | Output |
|-------|---------------------|--------|
| `vision` | L1 | `VISION.md` |
| `milestones` | L2 | `MILESTONES.md` |
| `architecture` | L3 | `ARCH.md` (per milestone) |
| `design` | L4 | `docs/detailed_design/<Phase_Name>/<component>.md` |

## Background Process Types

| Value | Examples | Purpose |
|-------|----------|---------|
| `dev_server` | `next dev`, `vite dev` | Local development server for preview |
| `test_watcher` | `vitest --watch`, `jest --watch` | Continuous test runner |
| `build_watcher` | `tsc --watch` | Continuous type checking / compilation |
| `custom` | User-defined | Extended integrations |

## Deployment Platforms

| Value | Platform |
|-------|----------|
| `vercel` | Vercel |
| `aws` | AWS (Lambda, EC2, etc.) |
| `local` | Local machine (dev/preview) |
| `custom` | User-configured target |

## Protocols

| Term | What It Is | Used For |
|------|-----------|----------|
| **MCP** | Model Context Protocol | Agent ↔ tool integration |
| **x402** | HTTP 402-based micropayment protocol | Paying for AutEng compute |
| **WebSocket** | Persistent bidirectional connection | Mobile ↔ HQ real-time sync |

## Naming Conventions

- Database columns: `snake_case`
- TypeScript types/interfaces: `PascalCase`
- TypeScript variables/functions: `camelCase`
- API routes: `kebab-case` (`/api/agent-tasks`)
- File names: `kebab-case` (`agent-manager.ts`)
- Env variables: `SCREAMING_SNAKE_CASE` (`AUTENG_API_KEY`)
- Doc files: `SCREAMING_SNAKE_CASE.md` (`VISION.md`)
- Skill directories: `kebab-case` (`skills/architecture/`)
- Detailed design directories: `Title_Case_With_Underscores` (`docs/detailed_design/Data_Model_and_API/`)
