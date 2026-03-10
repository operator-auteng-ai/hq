# Architecture Document Examples

Three real-world examples showing different scopes and patterns. Use these as reference for structure, diagram style, and level of detail.

---

## Table of Contents

1. [Greenfield System: Desktop App (HQ)](#1-greenfield-desktop-app) — System level, multiple apps (Electron + Next.js + Mobile + Cloud)
2. [Greenfield System: SaaS Platform (Quantreno)](#2-greenfield-saas-platform) — System level, multiple services (Vercel + Supabase + Kalshi + Stripe)
3. [Incremental Cross-cutting: Feature Addition (AutEng v7)](#3-incremental-feature-addition) — Cross-cutting, agent doc workspaces spanning backend + package + web
4. [Incremental Cross-cutting: CAS Subsystem (AutEng CAS)](#4-incremental-cross-cutting-cas) — Cross-cutting, math verification spanning frontend + backend + sandbox

---

## 1. Greenfield: Desktop App

**Level:** System — multiple applications (desktop, mobile, cloud services, dev agents)
**Scope:** Full system architecture for a local-first desktop application with cloud integration and mobile companion.

**Key patterns to note:**
- System Overview groups components into Local / Cloud / Mobile subgraphs
- Component Architecture goes one level deeper into the app's internal modules
- Sequence diagram shows the primary end-to-end flow spanning all major components
- ER diagram for local database schema
- Component Boundaries table clarifies ownership ("Owns" vs "Does NOT Own")
- Integration Points table lists every protocol with direction
- Simple Tech Stack table — layer + technology, no justification needed when choices are obvious

**Structure used:**
```
# ARCH — [Name]
## System Overview          → graph LR with 3 subgraphs
## Component Architecture   → graph TB showing internal modules
## Data Flow                → sequenceDiagram for primary use case
## Database Schema          → erDiagram
## Component Boundaries     → table: Component | Owns | Does NOT Own
## Integration Points       → table: Protocol | Used For | Direction
## Tech Stack               → table: Layer | Technology
```

---

## 2. Greenfield: SaaS Platform

**Level:** System — multiple services (web app, AI agent, exchange APIs, billing, job scheduler)
**Scope:** Full system architecture for a cloud-hosted SaaS product with AI agent, trading integration, billing, and scheduled jobs.

**Key patterns to note:**
- Tech Stack table includes a "Why" column justifying each choice — useful when decisions are non-obvious
- Multiple domain-specific mermaid diagrams (portfolio model, playbook pipeline, risk engine flow)
- Extensive sequence diagrams for each major flow (chat + trade, strategy creation, cron dispatch, auth + billing)
- ER diagram is comprehensive with field-level detail because the schema IS the architecture
- Key Decisions table with "Alternatives Considered" column — captures the reasoning
- Compute section addresses V1 vs V2 evolution with clear interface boundaries
- Shows how the architecture accommodates future growth without building for it now

**Structure used:**
```
# Architecture
> One-line + link to VISION.md
## Tech Stack               → table: Layer | Choice | Why
## System Overview           → graph TB with Client / Vercel / External subgraphs
## Portfolio Model           → graph TB + concepts table
## Playbook System           → graph LR pipeline + definitions table
## Risk Engine               → graph TB flow + controls tables
## Request Flows             → 4 sequenceDiagrams (chat, strategy, cron, auth)
## Database Schema           → erDiagram + schema changes table
## AI Tools                  → graph LR + tool descriptions table
## Cron Schedule             → gantt chart + vercel.json config
## Compute & Finance         → V1/V2 strategy with interface boundary diagram
## Key Architecture Decisions → table: Decision | Choice | Alternatives
```

---

## 3. Incremental: Cross-cutting Feature

**Level:** Cross-cutting — agent doc workspaces spanning backend API, npm package, and web frontend
**Scope:** Adding agent document workspaces to an existing platform. Builds on existing models and infrastructure.

**Key patterns to note:**
- Header immediately states the base it builds on and lists reused components
- System Overview shows both new and existing components — new ones labeled "NEW"
- Data Model section explicitly categorizes: New / Widened / Reused
- Explains migration strategy for modified models (rename, add column, zero data loss)
- "Why this works" explanations for key design choices
- Links to existing source files with relative paths
- API design grouped by auth requirement (free vs paid vs public)
- Separate sequence diagrams for each API flow
- "What We Build vs Reuse" inventory table at the end

**Structure used:**
```
# ARCH — [Name]
> One-line + "Builds on existing [base]: [list reused models]"
## System Overview           → graph TB showing new + existing
## Data Model                → New / Widened / Reused sections with erDiagram
## Auth                      → sequenceDiagram for auth flow
## API Design                → grouped endpoint tables + flow diagrams
## Flows                     → sequenceDiagram per operation
## Package Structure         → directory tree + interface definitions
## Rate Limiting             → table of rules + mechanisms
## What We Build vs Reuse    → table: Component | Status (New/Reuse/Migration)
```

---

## 4. Incremental: Cross-cutting Subsystem (CAS)

**Level:** Cross-cutting — math verification subsystem spanning frontend components, backend services, and sandboxed execution
**Scope:** Computer Algebra System integration for symbolic math verification. Crosses frontend (CASCodeBlock component), backend (service layer, Dramatiq workers), and external sandbox (E2B with SymPy).

**Key patterns to note:**
- System Architecture diagram places the cross-cutting service at center with consuming apps (Web, VSCode) at top
- Deep protocol documentation — SBM messages, CLI interface, JSON input/output formats are the integration contract
- Multiple execution flow diagrams showing how requests traverse the layers
- Error handling gets its own flow diagram — failure modes are architecturally significant in a cross-cutting service
- Detailed result types section — the response contract IS the architecture for consumers
- Directory structure shown for both backend and frontend — consumers need to know where to integrate
- "When to Use Each Mode" table helps consumers pick the right interface

**Structure used:**
```
# CAS Architecture
## Overview              → what it does, target use cases, link to requirements doc
## System Architecture   → graph TB with Frontend / Backend / Sandbox layers
## Directory Structure   → where code lives (both backend and frontend)
## Execution Flow        → sequenceDiagram for the full request lifecycle
## Core Components       → each service with responsibilities and key methods
## Result Types          → the response contract (enums, dataclasses)
## Protocol Messages     → request/response TypeScript interfaces
## Frontend Components   → integration points in the UI layer
## Error Handling        → flow diagram + suggestions table
## Testing               → test categories table
## Related Documents     → links to PLAN, PROGRESS_LOG, RESEARCH
```

**Cross-cutting pattern:** Notice how the document is organized around the *integration surface* — protocol messages, result types, execution flows between layers — rather than the internal implementation of any single layer. This is the hallmark of a cross-cutting architecture doc.

---

## Pattern Summary

### By Change Type

| Aspect | Greenfield | Incremental |
|--------|-----------|-------------|
| Header | Standalone description | States base + what's reused |
| System Overview | All components are new | Mix of new + existing, labeled |
| Data Model | Full schema | New/Widened/Reused categories |
| Decisions table | Broad architectural choices | Focused on "why not extend X" |
| Final section | Tech Stack or Key Decisions | What We Build vs Reuse inventory |
| Source links | Optional | Important — link to existing code being extended |

### By Architecture Level

| Aspect | System | Application | Cross-cutting |
|--------|--------|-------------|---------------|
| Star section | System Overview | Component Architecture | Integration Points + Key Flows |
| Diagram nodes | Applications / services | Modules / layers | The service + consuming apps |
| Edge labels | Protocols (REST, WS, IPC) | Internal calls, data flow | Integration contracts |
| Data Model | Major entities per app, cross-boundary relationships | Detailed single-DB schema | Shared state + response contracts |
| Tech Stack | Per-app or per-layer choices | Single app's stack | The service's stack + integration requirements |
| Key Decisions | Which apps, how they split, deployment topology | Internal patterns, frameworks, data access | Protocol choices, sync vs async, where logic lives |
| What to skip | Internal module details | Multi-app topology | App internals on either side |
