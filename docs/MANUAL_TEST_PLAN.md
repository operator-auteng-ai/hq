# Manual Test Plan — AutEng HQ

Manual tests for critical functionality. Run after significant changes or before a release.

**Prerequisites:**
- `pnpm install` from monorepo root
- `pnpm dev` from `apps/hq/` — app running at http://localhost:3000
- A valid Anthropic API key (starts with `sk-ant-`)

---

## 1. App Launch & Navigation

| # | Step | Expected |
|---|------|----------|
| 1.1 | Open http://localhost:3000 | Dashboard loads, no console errors |
| 1.2 | Click each sidebar link (Dashboard, Projects, Agents, Settings) | Each page renders, URL updates, no blank screens |
| 1.3 | Click browser back/forward | Navigation works, no stale state |

## 2. API Key Management (Settings)

| # | Step | Expected |
|---|------|----------|
| 2.1 | Navigate to Settings | Settings page shows API key section |
| 2.2 | Enter a valid API key (`sk-ant-...`) and click Save | "Configured" badge appears, key shown as masked hint (`...xxxx`) |
| 2.3 | Reload the page | Key persists — still shows "Configured" with hint |
| 2.4 | Click the eye icon | Key toggles between masked and visible |
| 2.5 | Enter an invalid key (no `sk-` prefix) and click Save | Error message appears, key not saved |
| 2.6 | Clear the key field and save | Key removed, shows "Not configured" |

**Pass criteria:** Key persists across reloads. Invalid keys rejected. Encryption status shown (encrypted in Electron, unencrypted in dev).

## 3. Project Creation

| # | Step | Expected |
|---|------|----------|
| 3.1 | Ensure API key is configured in Settings | |
| 3.2 | Navigate to Projects → New Project | Form appears with name, prompt, model selector |
| 3.3 | Enter name: "Test Invoice App" | |
| 3.4 | Enter prompt: "A simple invoicing app for freelancers. Create invoices, send them to clients via email, accept payments via Stripe, and track revenue on a dashboard." | |
| 3.5 | Select model: Sonnet | |
| 3.6 | Click "Create Project" | Button shows "Creating..." then "Planning..." with skill progress |
| 3.7 | Watch the SSE progress stream | Should show: `vision: running` → `vision: completed` → `milestones: running` → ... |
| 3.8 | Wait for pipeline to complete | Redirects to project detail page |

**Pass criteria:** Project created, planning pipeline runs (may take several minutes), redirects to detail page.

**If pipeline fails:** Check browser console and server terminal for errors. Most common: API key invalid, rate limited, or skills directory not found.

## 4. Project Detail Page

| # | Step | Expected |
|---|------|----------|
| 4.1 | After project creation, you're on the detail page | Project name shown, status badge visible |
| 4.2 | Check the Docs tab | Should show any docs the planning pipeline created (VISION.md at minimum) |
| 4.3 | Check the Milestones tab | If pipeline completed fully: milestone tree with phases and tasks visible. If only vision ran: "No milestones yet" with status message |
| 4.4 | Check the Agents tab | Should show agent runs from the planning pipeline (vision, milestones, architecture, design skill agents) |
| 4.5 | Check the Chat tab | Empty chat with placeholder text "Chat with the orchestrator about this project" |

**Pass criteria:** All tabs render. Data matches what the pipeline produced.

## 5. Orchestrator Chat

| # | Step | Expected |
|---|------|----------|
| 5.1 | Go to the Chat tab on a project | Chat panel visible with input field |
| 5.2 | Type "What is the current status?" and press Enter | Response streams in token-by-token. Content describes project state (milestones, tasks, statuses) |
| 5.3 | Type "What milestones are defined?" | Response lists milestones accurately |
| 5.4 | Reload the page, go back to Chat tab | Previous messages still visible (persisted) |
| 5.5 | Type an empty message and press Enter | Nothing happens (button disabled for empty input) |

**Pass criteria:** Chat responses are accurate to project state. Messages persist. Streaming works (tokens appear incrementally, not all at once).

**Note:** Chat requires API key and makes Claude API calls — costs money.

## 6. Milestone/Phase/Task Execution

**Prerequisite:** A project with milestones and tasks populated (from a completed planning pipeline, or manually created via API).

### 6a. If planning pipeline populated milestones:

| # | Step | Expected |
|---|------|----------|
| 6a.1 | Go to Milestones tab | Tree shows milestones → phases → tasks, all "pending" |
| 6a.2 | Call the API to start a phase: `curl -X PATCH http://localhost:3000/api/projects/<ID>/milestones -H "Content-Type: application/json" -d '{"action":"startPhase","phaseId":"<PHASE_ID>"}'` | Returns `{ agentId }`. Phase → active, milestone → active |
| 6a.3 | Go to Agents tab | Agent card appears with status "running" |
| 6a.4 | Click to view agent output | SSE stream shows agent working (reading docs, writing code) |
| 6a.5 | Wait for agent to complete | Task status → completed, next task auto-starts |
| 6a.6 | When all tasks in phase complete | Phase → reviewing (review agent spawns) |

### 6b. If no milestones exist (create manually):

| # | Step | Expected |
|---|------|----------|
| 6b.1 | Use the delivery tracker API to create test data: | |
| | `curl -X POST http://localhost:3000/api/projects -H "Content-Type: application/json" -d '{"name":"Manual Test","prompt":"Test project for manual testing purposes"}'` | Returns project with ID |
| 6b.2 | Note the project ID and verify it appears in the Projects list | |

**Pass criteria:** Agent spawns, streams output, auto-advances to next task. Milestone/phase statuses update correctly.

## 7. Agent Monitor

| # | Step | Expected |
|---|------|----------|
| 7.1 | Navigate to Agents page | Shows all agents across projects |
| 7.2 | If agents are running: check live output | SSE stream shows real-time agent activity |
| 7.3 | If agents are completed: check status badges | Show "completed" or "failed" with correct styling |

## 8. Error Handling

| # | Step | Expected |
|---|------|----------|
| 8.1 | Remove API key from Settings | |
| 8.2 | Try to create a new project | Project creates, but planning pipeline should fail with "No API key" error |
| 8.3 | Try to send a chat message | Should show error about missing API key |
| 8.4 | Re-add API key | |
| 8.5 | Create a project with a very short prompt (< 20 chars) | Validation error — Create button disabled |

## 9. Design System (Dev Only)

| # | Step | Expected |
|---|------|----------|
| 9.1 | Navigate to /design-system | Overview page with component categories |
| 9.2 | Click through to Tokens page | Color swatches, typography scale, spacing samples render |
| 9.3 | Click through to Components page | Component demos grouped by atom/molecule/component |

## 10. Workspace Verification

After a project is created:

| # | Step | Expected |
|---|------|----------|
| 10.1 | Check `~/auteng-projects/<project-slug>/` exists | Directory created |
| 10.2 | Check `skills/` directory inside workspace | Contains vision/, milestones/, architecture/, design/ with SKILL.md files |
| 10.3 | Check `docs/` directory | Contains PLAN_PROGRESS_LOG.md, WORKFLOW_AUDIT.md, and any docs produced by skills |
| 10.4 | Check `CLAUDE.md` at workspace root | Contains project name and doc read order |
| 10.5 | Run `git log` inside workspace | Has initial commit "init: workspace scaffold with skills" |

---

## Quick Smoke Test (5 minutes)

If you only have time for one pass:

1. Start app (`pnpm dev`)
2. Go to Settings → enter API key → save → verify "Configured" badge
3. Go to Projects → New Project → enter name + prompt → click Create
4. Watch planning progress → verify at least vision skill runs
5. Check project detail page → verify Milestones tab renders
6. Go to Chat tab → ask "What is the status?" → verify response streams
7. Check Agents tab → verify planning agents visible

---

## Known Limitations

- **Planning pipeline duration:** Full pipeline (4 skills × N milestones × N components) can take 5-15 minutes with Sonnet. The SSE connection stays open the entire time.
- **Agent execution requires Claude Code CLI:** The `@anthropic-ai/claude-agent-sdk` spawns Claude Code as a subprocess. It must be installed and accessible in PATH.
- **Workspace creation may fail:** If the skills directory can't be resolved (e.g., running from an unexpected CWD), workspace creation fails silently and the project has no workspace.
- **No task start buttons in UI yet:** Task/phase start is currently via API only. UI inline controls are Phase 8.
