---
name: architecture
description: >
  Generate or update ARCH.md architecture documents with mermaid diagrams, system overviews,
  component boundaries, and data flows. ALWAYS use this skill when the user wants to:
  create an architecture document, write up system design, document how components connect,
  create an ARCH.md, update an existing architecture doc, design a new system or service,
  or plan how multiple applications interact. Trigger on phrases like "architecture",
  "arch doc", "system design", "high-level design", "write up the arch", "document the
  architecture", "how should this be structured", or when the user describes multiple
  services/apps and wants to document their relationships. Covers greenfield systems,
  incremental features, and cross-cutting concerns. Even if the user doesn't explicitly
  say "architecture", trigger if they're describing a multi-component system and asking
  for documentation of how the pieces fit together.
---

# Architecture Document Skill

Create high-level architecture documents that communicate system design through diagrams, tables, and prose. These documents are living artifacts — they evolve as the architecture becomes clearer.

## Before You Start

### 1. Gather Context

**Check for sibling documents** in the target directory (and parent `docs/` directory):

- `VISION.md` — product scope, goals, constraints
- `OVERVIEW.md`, `REQUIREMENTS.md`, `PRD.md`, `SPEC.md` — functional/non-functional requirements
- `PLAN.md` — implementation phases
- `CODING-STANDARDS.md` — tech conventions
- Any existing `ARCH.md` — are we updating or creating fresh?

Read any that exist. They provide essential context for architectural decisions and should be referenced in the ARCH doc where relevant.

**Check for an existing ARCH.md** at the target path:
- If one exists, you're likely doing an incremental update — confirm with the user
- If none exists, this is a greenfield architecture

### 2. Determine Scope

Two dimensions to identify: **change type** (greenfield vs incremental) and **architecture level**.

**Change type** — infer from context:

| Signal | Change Type | Default Path |
|--------|-------------|-------------|
| No existing ARCH.md, broad system description | **Greenfield** | `docs/ARCH.md` |
| Existing ARCH.md, user describes a feature or version | **Incremental** | `docs/<FEATURE>_ARCH.md` or `docs/<version>/<FEATURE>_ARCH.md` |
| User specifies a path | **User override** | Whatever they said |

**Naming convention:** The main system architecture is always `ARCH.md`. Feature or subsystem architectures use a descriptive prefix: `MOBILE_ARCH.md`, `AUTH_ARCH.md`, `NOTIFICATION_ARCH.md`, `CAS_ARCH.md`. This makes it immediately clear what each doc covers when scanning a directory listing. The user can override this, but always propose a descriptive name.

**Architecture level** — this determines the altitude of your diagrams, the granularity of components, and which sections matter most. Infer from what the user is describing:

| Level | What it covers | Signals | Diagram focus |
|-------|---------------|---------|---------------|
| **System** | Multiple applications/services that work together as a product | User mentions multiple apps, deployment targets, mobile + desktop + cloud, multiple teams | Applications as nodes, inter-app protocols (REST, WebSocket, IPC), deployment topology, per-app tech stacks |
| **Application** | Internals of a single application | User describes one app's features, modules, layers, or architecture patterns | Modules/layers as nodes, internal component boundaries, request flows within the app, database schema |
| **Cross-cutting** | A concern or subsystem that spans multiple applications | User describes auth, observability, a shared service, a protocol, or a capability used across apps | The cross-cutting system at center with consuming apps around it, integration interface, protocol flows |

These levels change how you structure the document:

**System level** — the System Overview is the star. Show each application as a box, group by deployment context (local, cloud, mobile). The component architecture section goes one level into each app but no deeper. Data model shows the major entities per app and how they relate across boundaries. Integration points table is essential — this is where the architecture lives.

**Application level** — the Component Architecture is the star. The system overview may be simple (one app + its external dependencies). Go deeper into internal modules, layers, and boundaries. Data model can be more detailed since there's one database context. Key flows show request paths through the application's layers.

**Cross-cutting** — the Integration Points and Key Flows are the stars. Show how the cross-cutting concern connects to each consuming system. The data model focuses on the shared state. Sequence diagrams should show the cross-system flows that motivated the architecture. Include a clear API/protocol contract section — consuming apps need to know the interface.

When the level isn't obvious, default to the highest level that makes sense. A notification service consumed by other apps is **cross-cutting**. A notification service that IS the product is **application level**. An entire product suite is **system level**.

### 3. Ask Clarifying Questions (max 3)

Ask at most **3 clarifying questions** before producing the first draft. Pick the most important gaps — you can fill in the rest with reasonable defaults and options in the document itself.

Good clarifying questions target:
- What the system/feature actually does (if not clear from context)
- Key constraints or non-negotiables (performance targets, must-use technologies, deployment environment)
- Integration points (what existing systems does this connect to?)

Do NOT ask about things you can infer or propose with options. Get to a draft fast and iterate from there.

## Document Structure

Use this structure as a template. Not every section applies to every architecture — skip sections that don't make sense and add sections that do. The goal is clarity, not completeness for its own sake.

### Header

```markdown
# ARCH — [Project/Feature Name]

> [One-line description of what this architecture covers]
> [Level: System | Application | Cross-cutting]
> [For incremental: "Builds on [base]. See [link] for the existing architecture."]

---
```

For incremental architectures, the header should explicitly state what's new vs reused:
```markdown
> Architecture for [feature] — [brief description].
> Level: Cross-cutting | Builds on existing [base]: [list key reused components].
```

The level tag helps readers immediately understand the altitude of the document. A "System" doc means they'll see multiple applications. An "Application" doc means they'll see internal modules. A "Cross-cutting" doc means they'll see integration interfaces.

### System Overview

A mermaid `graph` showing the major components and how they connect. This is the "if you only look at one diagram" view.

- Use `subgraph` blocks to group related components (e.g., "Frontend", "Backend", "External Services")
- Label edges with protocols or interaction types where helpful
- Keep it to one level of abstraction — this is the 30,000 foot view

### Component Architecture

Deeper breakdown of each major component from the system overview. Another mermaid `graph` or multiple, showing internal structure.

For each significant component, a **Component Boundaries** table clarifies ownership:

```markdown
| Component | Owns | Does NOT Own |
|-----------|------|-------------|
| **Orchestrator** | Phase sequencing | Agent implementation details |
```

### Data Model

If the system has persistent state, show the data model with mermaid `erDiagram`. Focus on entities and relationships, not column details (unless the columns ARE the architecture, like in a schema-first design).

For incremental architectures, clearly mark:
- **New** — models being added
- **Reused** — existing models used as-is
- **Widened/Modified** — existing models being changed (explain the migration)

### Key Flows

Mermaid `sequenceDiagram` blocks for the 2-4 most important flows. These should cover:
- The happy path of the primary use case
- Any flow that crosses multiple components or services
- Auth/security flows if they're architecturally significant

### Integration Points

A table showing how components communicate:

```markdown
| Protocol | Used For | Direction |
|----------|----------|-----------|
| REST     | Cloud deployments | App → Cloud |
| WebSocket | Real-time updates | Bidirectional |
```

### Tech Stack

A table of technology choices with brief justification:

```markdown
| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js | SSR, API routes, existing team knowledge |
```

### Target Architecture

Document the deployment targets and platform constraints. This is especially important for system-level architectures where components run on different platforms, but even application-level docs benefit from stating the target environment explicitly.

```markdown
| Component | Platform | Architecture | Notes |
|-----------|----------|-------------|-------|
| HQ Desktop | macOS | arm64 (Apple Silicon) | Electron, primary target |
| HQ Desktop | macOS | x86_64 | Electron, secondary target |
| Mobile App | Android | arm64 | React Native / Expo |
| Mobile App | iOS | arm64 | React Native / Expo |
| Backend API | Linux | x86_64 / arm64 | Docker container |
```

Include minimum OS versions, runtime requirements (e.g., Node 20+, Python 3.11+), and any platform-specific constraints that influence architectural decisions. If the architecture targets a single platform, a brief note suffices — a full table isn't needed.

### Architectural Considerations

Address these cross-cutting concerns where relevant. Use a mix of prose and tables. If a concern doesn't apply, skip it — don't force it.

- **Scalability** — what are the expected loads, what's the scaling strategy
- **Reliability** — failure modes, redundancy, graceful degradation
- **Availability** — uptime targets, deployment strategy
- **Performance** — latency targets, caching strategy, hot paths
- **Security** — auth model, data protection, trust boundaries
- **Testing** — testing strategy at the architectural level (integration, E2E, contract tests)

### Key Decisions

A table of significant architectural decisions with alternatives considered:

```markdown
| Decision | Choice | Alternatives Considered |
|----------|--------|------------------------|
| Monolith vs microservices | Monolith | Separate API — unnecessary complexity for V1 |
```

This is one of the most valuable sections — it captures *why* the architecture is the way it is.

### What We Build vs Reuse

For incremental architectures, a clear inventory:

```markdown
| Component | Status |
|-----------|--------|
| User model | **Reuse** |
| Auth middleware | **New** |
| Role table | **Migration** (rename + add column) |
```

### Related Documents

Links to sibling docs (VISION, PLAN, REQUIREMENTS, etc.) and any external references.

## Style Guidelines

### Diagrams

- Use mermaid exclusively — `graph`, `sequenceDiagram`, `erDiagram`, `gantt`, `flowchart`
- Every major section should have at least one diagram
- Diagrams should be self-explanatory — a reader should understand the gist without reading the prose
- Use `subgraph` blocks to create visual grouping
- Label edges when the relationship isn't obvious
- Use `<br/>` in node labels for multi-line descriptions with context

### Prose

- Keep prose concise — tables and diagrams do the heavy lifting
- Explain the *why* behind decisions, not just the *what*
- Use `**bold**` for key terms on first use
- Link to source files with relative paths where it helps: `(see [models.py](../../src/models.py))`

### What NOT to Include

- Implementation code (no function bodies, no class definitions)
- Class-level or method-level diagrams — stay at the system/component level
- Deployment scripts or configuration details (those go in ops docs)
- API endpoint specifications (those go in API docs)
- Step-by-step implementation instructions (those go in PLAN.md)

It is fine to show pseudocode-level interfaces, CLI invocations, or config schemas when they ARE the architecture (e.g., showing a CLI protocol between components, or a config schema that defines behavior). The line is: show the contracts and boundaries, not the internals.

## Iteration Workflow

After producing the first draft:

1. **Present options where you weren't sure** — e.g., "I've proposed PostgreSQL here but Redis could work too — see the Key Decisions table for the tradeoff"
2. **Call out what's missing** — "I didn't cover the caching strategy because I'm not sure about your latency requirements. Want me to add that?"
3. **Iterate** until the user is satisfied — the doc is mutable and should evolve

When the user asks for changes, update the document in place rather than rewriting from scratch. Architecture docs grow and refine over multiple passes.

## Per-Milestone Mode (Planning Engine)

When invoked by the planning engine, the architecture skill operates in **per-milestone mode**. Instead of producing a full architecture document, it produces a focused delta scoped to a single milestone.

### Scope and Output Location

- The scope is a single milestone (name provided in the prompt).
- Output goes to `docs/milestones/<milestone_name>/ARCH.md`.
- If the milestone is complex enough to warrant sub-documents (e.g., a detailed data model, a protocol spec, or a subsystem deep-dive), place them in the same directory: `docs/milestones/<milestone_name>/`.

### Delta-Based Output

In per-milestone mode, write **deltas, not full docs**. Assume the reader has already read the canonical architecture documents (`docs/ARCH.md` and `docs/arch/`). Do NOT re-state existing architecture.

Structure the milestone ARCH.md with these sections:

- **New Components** — components being introduced by this milestone. Include a mermaid diagram showing how they fit into the existing system overview.
- **Schema Changes** — new tables, widened columns, new relationships. Use mermaid `erDiagram` and mark each entity as New, Modified, or Reference (existing, shown for context).
- **New Integration Points** — new protocols, APIs, IPC channels, or event flows introduced. Use the standard integration points table format.
- **Key Decisions** — architectural decisions made for this milestone, with alternatives considered.

Skip any section that has no content for this milestone. Add additional sections if the milestone introduces something that doesn't fit the four above (e.g., a new deployment target, a security boundary change).

### Components Requiring Detailed Design

Always include this section at the end of the delta content. List components introduced or significantly changed by this milestone that need their own detailed design documents. These drive the design skill.

```markdown
### Components Requiring Detailed Design

- **AgentSandbox** — isolation model, resource limits, IPC protocol with orchestrator
- **DeployPipeline** — stage definitions, rollback strategy, provider abstraction
- **KPICollector** — metric schema, polling vs push, aggregation windows
```

### Roll-up Plan

Always include this section as the very last section in the milestone ARCH.md. It describes how the milestone's architectural delta should be merged into the canonical docs after milestone completion.

Use these categories:

- **"New subsystem"** → create `docs/arch/<name>/ARCH.md`
- **"Extends existing"** → merge into the existing canonical doc (specify which one)
- **"Cross-cutting concern"** → create or update `docs/arch/<concern>/ARCH.md`
- **"Update ARCH.md"** → what to add to the system overview in `docs/ARCH.md` (new nodes, new edges, new subgraphs)

```markdown
### Roll-up Plan

| Delta | Category | Target |
|-------|----------|--------|
| AgentSandbox | New subsystem | Create `docs/arch/agent-sandbox/ARCH.md` |
| Deploy pipeline | Extends existing | Merge into `docs/arch/deploy/ARCH.md` |
| Observability hooks | Cross-cutting concern | Update `docs/arch/observability/ARCH.md` |
| System overview | Update ARCH.md | Add AgentSandbox node, edge to Orchestrator |
```

### Canonical Roll-up Mode

When invoked in **roll-up mode** (after milestone completion), the skill executes the roll-up rather than producing a delta. The workflow is:

1. Read the milestone delta's **Roll-up Plan** from `docs/milestones/<milestone_name>/ARCH.md`.
2. Read the existing canonical docs (`docs/ARCH.md` and any files under `docs/arch/` referenced in the plan).
3. Execute each row of the roll-up plan:
   - Create new canonical docs under `docs/arch/` for new subsystems and cross-cutting concerns.
   - Merge delta content into existing canonical docs for "extends existing" entries.
   - Update the `docs/ARCH.md` system overview diagram and component boundaries table.
4. The milestone directory (`docs/milestones/<milestone_name>/`) is **kept for historical reference** — do not delete or modify it during roll-up.

## Reference Examples

For examples of well-structured architecture documents in different contexts, see `references/examples.md`. These show both greenfield and incremental patterns.
