# ARCH — AutEng HQ

## System Overview

```mermaid
graph LR
    subgraph Local["Local Machine"]
        HQ["AutEng HQ<br/>(Electron + Next.js)"]
        DB["SQLite"]
        Agents["Dev Agents<br/>(Claude Code / Codex CLI)"]
        Projects["Project Workspaces<br/>(local git repos)"]
    end

    subgraph Cloud["Cloud Services"]
        AutEng["AutEng Compute<br/>(x402)"]
        Deploy["Deployment Targets<br/>(Vercel / AWS / etc.)"]
        AI["AI APIs<br/>(Claude / OpenAI)"]
    end

    subgraph Mobile["Mobile"]
        App["AutEng HQ Mobile<br/>(React Native)"]
    end

    HQ --> DB
    HQ --> Agents
    HQ --> AutEng
    HQ --> Deploy
    HQ --> AI
    Agents --> Projects
    App -->|"WebSocket"| HQ
```

## Component Architecture

```mermaid
graph TB
    subgraph Electron["Electron Shell"]
        Main["Main Process"]
        subgraph Renderer["Renderer (Next.js)"]
            Dashboard["Dashboard"]
            ProjectView["Project View"]
            AgentMonitor["Agent Monitor"]
            Settings["Settings"]
        end
        subgraph Backend["Backend Services"]
            API["API Layer<br/>(Next.js API Routes)"]
            Orchestrator["Orchestrator"]
            AgentManager["Agent Manager"]
            DocGenerator["Doc Generator"]
            DeployManager["Deploy Manager"]
            KPITracker["KPI Tracker"]
            FeedbackEngine["Feedback Engine"]
            WSServer["WebSocket Server"]
        end
    end

    Main --> Renderer
    Main --> Backend
    Dashboard --> API
    ProjectView --> API
    AgentMonitor --> API
    API --> Orchestrator
    Orchestrator --> AgentManager
    Orchestrator --> DocGenerator
    Orchestrator --> DeployManager
    Orchestrator --> KPITracker
    Orchestrator --> FeedbackEngine
    WSServer -->|"Mobile connection"| API
```

## Data Flow — Prompt to Product

```mermaid
sequenceDiagram
    participant U as User
    participant HQ as HQ App
    participant DG as Doc Generator
    participant AM as Agent Manager
    participant A as Dev Agent
    participant D as Deploy Manager
    participant F as Feedback Engine
    participant K as KPI Tracker

    U->>HQ: Starting prompt
    HQ->>DG: Generate workflow docs
    DG-->>HQ: VISION, ARCH, PLAN, TAXONOMY, CODING-STANDARDS
    HQ->>HQ: Create project workspace (git init)

    loop Each Phase
        HQ->>AM: Start Phase N
        AM->>A: Spawn agent (Claude Code / Codex)
        A->>A: Read docs, implement tasks (log each action)
        A-->>AM: Phase complete
        AM->>HQ: Phase N done
        HQ->>F: Phase Feedback
        F->>F: Review action logs, flag discoveries
        F-->>HQ: Doc updates applied
    end

    HQ->>D: Deploy
    D-->>HQ: Deployment URL
    HQ->>K: Begin monitoring
    K-->>HQ: KPI data stream
    HQ->>F: Version Feedback
    F-->>HQ: All docs reconciled
```

## Database Schema

```mermaid
erDiagram
    projects {
        text id PK
        text name
        text prompt
        text status
        text workspace_path
        text deploy_url
        timestamp created_at
        timestamp updated_at
    }

    phases {
        text id PK
        text project_id FK
        int phase_number
        text name
        text status
        text exit_criteria
        timestamp started_at
        timestamp completed_at
    }

    agent_tasks {
        text id PK
        text phase_id FK
        text agent_type
        text command
        text status
        text output
        int exit_code
        timestamp created_at
        timestamp completed_at
    }

    kpi_snapshots {
        text id PK
        text project_id FK
        text metric_name
        real metric_value
        timestamp recorded_at
    }

    deploy_events {
        text id PK
        text project_id FK
        text platform
        text environment
        text status
        text url
        timestamp deployed_at
    }

    projects ||--o{ phases : "has"
    phases ||--o{ agent_tasks : "contains"
    projects ||--o{ kpi_snapshots : "tracks"
    projects ||--o{ deploy_events : "deploys"
```

## Component Boundaries

| Component | Owns | Does NOT Own |
|-----------|------|-------------|
| **Orchestrator** | Phase sequencing, project lifecycle | Agent implementation details |
| **Agent Manager** | Spawning/killing agents, collecting output | What the agent builds |
| **Doc Generator** | Generating workflow docs from prompt | Editing docs after generation |
| **Deploy Manager** | Triggering deployments, tracking URLs | Hosting infrastructure |
| **KPI Tracker** | Collecting and storing metrics | Defining what metrics matter (that's in project VISION) |
| **Feedback Engine** | Reviewing action logs, flagging doc updates needed, running feedback checklists (see WORKFLOW.md) | Deciding *what* to change (that's the agent or user) |
| **WebSocket Server** | Mobile ↔ HQ real-time connection | Mobile app UI |

## Integration Points

| Protocol | Used For | Direction |
|----------|----------|-----------|
| **MCP** | Tool integration (agents ↔ external services) | Bidirectional |
| **x402** | Pay-per-request compute via AutEng | HQ → AutEng |
| **WebSocket** | Mobile app real-time control | Mobile ↔ HQ |
| **REST** | Cloud deployments, AI APIs | HQ → Cloud |
| **stdio** | Local agent communication (Claude Code, Codex) | HQ ↔ Agent process |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| UI framework | Next.js (React) |
| Styling | Tailwind CSS |
| Local database | SQLite (via better-sqlite3 or drizzle) |
| Real-time | Socket.io |
| Mobile app | React Native (Expo) |
| Monorepo | Turborepo |
| Language | TypeScript throughout |
