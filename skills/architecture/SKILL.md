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

## Reference Examples

For examples of well-structured architecture documents in different contexts, see `references/examples.md`. These show both greenfield and incremental patterns.
