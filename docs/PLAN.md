# PLAN — AutEng HQ

## Current State

Empty project directory. Workflow documents created. No code, no infrastructure.

## Future State

See [ARCH.md](./ARCH.md) — a fully functioning Electron + Next.js desktop app distributable as .dmg, with mobile companion app, managing multiple agent-operated businesses.

## Version: v0 (MVP)

### Phase 0 — Skeleton

**From**: Empty directory
**To**: Bootable Electron + Next.js app with empty dashboard

| Task | Description |
|------|-------------|
| 0.1 | Monorepo setup (Turborepo): `apps/hq`, `apps/mobile`, `packages/shared` |
| 0.2 | Electron + Next.js wiring (Nextron) |
| 0.3 | Tailwind CSS configuration |
| 0.4 | SQLite database initialized with schema from ARCH.md |
| 0.5 | Empty dashboard shell with sidebar navigation |
| 0.6 | Build pipeline: dev (hot reload) and production (.dmg) |

**Exit Criteria**: App launches locally. Build produces a working .dmg. SQLite DB created on first launch.

**Feedback**: Reconcile docs against actual skeleton. Update ARCH.md if tech stack decisions changed during setup.

---

### Phase 1 — Project Creation

**From**: Empty dashboard
**To**: User can create projects from a prompt with auto-generated workflow docs

| Task | Description |
|------|-------------|
| 1.1 | "New Project" UI: prompt input form |
| 1.2 | Project record creation in DB |
| 1.3 | Doc Generator: prompt → VISION, ARCH, PLAN, TAXONOMY, CODING-STANDARDS for the new project |
| 1.4 | Local workspace creation (`git init`) with generated docs committed |
| 1.5 | Project list view on dashboard |
| 1.6 | Project detail view showing generated docs and status |

**Exit Criteria**: Prompt → project with 5 docs → visible in dashboard → workspace on disk as git repo.

**Feedback**: Validate doc generation quality. Update ARCH.md if Doc Generator component boundaries shifted.

---

### Phase 2 — Agent Execution

**From**: Projects exist but nothing is built
**To**: Dev agents implement project phases autonomously

| Task | Description |
|------|-------------|
| 2.1 | Agent Manager: spawn Claude Code / Codex CLI as child processes |
| 2.2 | Feed project docs as context to agent |
| 2.3 | Capture stdout/stderr in real-time, stream to UI |
| 2.4 | Store agent task records in DB (see ARCH: `agent_tasks`) |
| 2.5 | Agent Monitor view: live output, status, history |
| 2.6 | Phase progression with user approval gate |

**Exit Criteria**: HQ spawns agents, streams output to UI, records tasks in DB. User approves phase completion before next phase starts.

**Feedback**: Refine agent spawning patterns. Update ARCH.md with any new IPC mechanisms discovered. Update TAXONOMY.md if new agent statuses emerged.

---

### Phase 3 — Deployment

**From**: Code built by agents, sitting locally
**To**: Projects deployed to cloud with tracked history

| Task | Description |
|------|-------------|
| 3.1 | Deploy Manager: Vercel integration (CLI or API) |
| 3.2 | Manual or automatic deploy trigger on phase completion |
| 3.3 | Deploy status tracking and URL capture |
| 3.4 | Deploy events stored in DB (see ARCH: `deploy_events`) |
| 3.5 | Deploy history view in project detail |

**Exit Criteria**: One-click deploy to Vercel from HQ. Deploy URL and history visible in dashboard.

**Feedback**: Validate deploy flow against ARCH.md sequence diagram. Add any new deployment platforms to TAXONOMY.md.

---

### Phase 4 — Monitoring & KPIs

**From**: Deployed but unmonitored projects
**To**: Live health and business metrics with alerting

| Task | Description |
|------|-------------|
| 4.1 | KPI Tracker: define and collect metrics per project |
| 4.2 | Platform integration for uptime/error data |
| 4.3 | Dashboard charts and trends (see ARCH: `kpi_snapshots`) |
| 4.4 | Threshold-based alerting |

**Exit Criteria**: Live KPIs on dashboard. Historical trends. Alerts on threshold breach.

**Feedback**: Review which KPIs actually matter vs. what was planned. Update VISION.md success metrics if needed.

---

### Phase 5 — Mobile App

**From**: HQ only accessible from desktop
**To**: Remote monitoring and control from mobile

| Task | Description |
|------|-------------|
| 5.1 | WebSocket server in HQ (Socket.io) |
| 5.2 | Expo React Native app scaffolded in `apps/mobile` |
| 5.3 | Mobile connects to HQ via WebSocket |
| 5.4 | Mobile views: project list, status, agent activity, KPIs |
| 5.5 | Mobile actions: approve phase, trigger deploy, pause agents |

**Exit Criteria**: Mobile connects to HQ. Can view projects, approve phases, receive push notifications.

**Feedback**: Validate WebSocket protocol against ARCH.md. Update ARCH.md with any mobile-specific components discovered.

---

### Phase 6 — Multi-Project Orchestration

**From**: Works for individual projects
**To**: Smooth management of 10+ concurrent projects

| Task | Description |
|------|-------------|
| 6.1 | Aggregate dashboard overview |
| 6.2 | Agent concurrency limits and resource management |
| 6.3 | Cross-project search, filtering, bulk actions |
| 6.4 | Performance optimization for concurrent agent processes |

**Exit Criteria**: 10 projects running concurrently without UI lag. Bulk operations work reliably.

**Feedback**: Full v0 version feedback (see WORKFLOW.md). Reconcile all docs against built system. Seed `docs/v1/` if next version is planned.

---

## Dependency Graph

```mermaid
graph TD
    P0["Phase 0: Skeleton"] --> P1["Phase 1: Project Creation"]
    P1 --> P2["Phase 2: Agent Execution"]
    P2 --> P3["Phase 3: Deployment"]
    P2 --> P5["Phase 5: Mobile App"]
    P3 --> P4["Phase 4: Monitoring"]
    P5 --> P6["Phase 6: Multi-Project"]
```
