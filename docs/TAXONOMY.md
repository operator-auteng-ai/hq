# TAXONOMY — AutEng HQ

## Work Unit Hierarchy

The same hierarchy governs both AutEng HQ development and every project HQ manages.

```
Project → Version → Phase
```

| Term | Definition | NOT |
|------|-----------|-----|
| **Project** | A self-contained business/product managed by HQ, created from a starting prompt | A git repo (a project *has* a workspace which is a repo) |
| **Version** | A release cycle within a project (v0 = MVP, v1, v2, ...). Each version has its own docs directory and PLAN | A branch (versions are semantic, not git branches) |
| **Phase** | A discrete stage within a version with defined scope and exit criteria. Ends with a feedback stage | A version (phases are smaller units within a version) |

## Other Core Entities

| Term | Definition | NOT |
|------|-----------|-----|
| **Prompt** | The starting natural-language description that seeds a project | An ongoing chat (it's a one-shot input) |
| **Workspace** | The local git repository where a project's code lives | The HQ app itself |
| **Dev Agent** | A CLI-based AI tool (Claude Code, Codex CLI) spawned as a child process | A service or daemon (agents are ephemeral) |
| **Deployment** | A built project pushed to a cloud platform | Running locally (that's a "local run") |
| **KPI** | A quantitative business or health metric tracked over time | A log entry (KPIs are aggregated, logs are raw) |
| **Feedback** | The process of reconciling docs against reality at the end of a phase, version, or project shutdown (see WORKFLOW.md) | A retrospective (feedback updates documents, not just discussion) |
| **Plan Progress Log** | Append-only record of task completions, phase transitions, and discoveries against the PLAN. Stored in PLAN_PROGRESS_LOG.md | An orchestrator audit (that's WORKFLOW_AUDIT) |
| **Workflow Audit** | Append-only record of orchestrator actions: agent spawns, deploy triggers, approvals, feedback runs, doc updates. Stored in WORKFLOW_AUDIT.md | Plan progress (that's PLAN_PROGRESS_LOG) |

## Statuses

### Project Status

| Value | Meaning |
|-------|---------|
| `draft` | Created, docs being generated |
| `planning` | Docs generated, awaiting user review |
| `building` | Agents actively implementing phases |
| `deployed` | Live in production |
| `paused` | User paused all activity |
| `archived` | No longer active |

### Version Status

| Value | Meaning |
|-------|---------|
| `planning` | Docs being written for this version |
| `active` | Phases being executed |
| `feedback` | All phases done, version feedback in progress |
| `released` | Version shipped |

### Phase Status

| Value | Meaning |
|-------|---------|
| `pending` | Not yet started |
| `active` | Agent(s) working on it |
| `review` | Awaiting user approval |
| `feedback` | Exit criteria met, feedback stage running |
| `completed` | Exit criteria met, feedback applied, approved |
| `failed` | Agent could not complete, needs intervention |

### Agent Run Status

| Value | Meaning |
|-------|---------|
| `queued` | Waiting to be picked up |
| `running` | Agent process active |
| `completed` | Finished successfully (exit code 0) |
| `failed` | Process errored (exit code != 0) |
| `cancelled` | Killed by user or orchestrator |

### Deploy Status

| Value | Meaning |
|-------|---------|
| `pending` | Deploy initiated |
| `building` | Platform building the project |
| `live` | Successfully deployed |
| `failed` | Deploy errored |
| `rolled_back` | Reverted to previous version |

## Agent Types

| Value | Tool | Use Case |
|-------|------|----------|
| `claude_code` | Claude Code CLI | Primary dev agent |
| `codex_cli` | OpenAI Codex CLI | Alternative dev agent |
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
