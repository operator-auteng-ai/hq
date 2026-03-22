---
name: design
description: >
  Produce a detailed design document for a single component. Covers interface
  (types and signatures), data model, behaviour (happy path + error states),
  implementation tasks, and exit criteria. Use this skill for each component
  listed in an architecture document's "Components Requiring Detailed Design"
  section.
---

# Detailed Design Document Skill

Produce a complete design document for a single component. The output gives an implementing agent everything it needs to build the component without making architectural decisions.

## Input

Your agent prompt provides:
- The **component name** to design
- The **output path** (e.g., `docs/detailed_design/Phase_Name/component-name.md`)
- Context from the milestone's arch delta and canonical architecture docs

Read the referenced architecture documents before writing. The detailed design must be consistent with architectural decisions already made.

## Output

Write the design document to the path provided in the prompt. Create intermediate directories as needed. Use this exact structure:

```
# <Component Name> — Detailed Design

## Purpose

## Interface

## Data Model

## Behaviour

### Happy Path

### Error States

## Tasks

## Exit Criteria
```

## Rules

### Purpose
- 1-2 sentences. What this component does and why it exists.
- Reference the milestone or capability it supports.

### Interface
- **TypeScript types and function signatures ONLY.** No implementation bodies.
- Use code blocks. Show the public API surface that other components will call.
- Include parameter types, return types, and any generic constraints.
- If the component exposes React components, show their prop types.
- If the component is an API route, show request/response types.

```typescript
// Good
export function createInvoice(params: CreateInvoiceParams): Promise<Invoice>;

// Bad — no function bodies
export function createInvoice(params: CreateInvoiceParams): Promise<Invoice> {
  const invoice = await db.insert(invoices).values(params);
  return invoice;
}
```

### Data Model
- If the component owns database tables: show the **Drizzle schema** definition (types only, no migration code).
- If the component consumes data from other components: show the **type shapes** it expects.
- If no persistent state: say "No persistent state" and describe any in-memory data structures if relevant.

### Behaviour — Happy Path
- Step-by-step description of what happens when everything works. Use a numbered list.
- Cover the primary use case end-to-end. Include what triggers the flow and what the final state is.

### Behaviour — Error States
- List each error condition, what causes it, and how the component handles it.
- Use a table or bullet list. Every error must have a defined response — no "TBD" or "handle later".

```
| Error | Cause | Response |
|-------|-------|----------|
| Invoice not found | Invalid ID in request | Return 404, log warning |
| DB write failure | SQLite constraint violation | Return 400 with validation errors |
```

### Tasks
- Concrete, implementable checklist items. Each task is completable in a **single agent session**.
- Prefer **many small tasks** over few large ones. A task like "implement the entire API" is too big.
- Use checkbox format: `- [ ] task description`
- Order tasks by implementation dependency — earlier tasks unblock later ones.
- Include test-writing tasks explicitly. Do not assume tests are implicit.

```
- [ ] Create Drizzle schema for invoices table
- [ ] Write createInvoice function with validation
- [ ] Write getInvoice and listInvoices query functions
- [ ] Add POST /api/invoices route
- [ ] Add GET /api/invoices and GET /api/invoices/:id routes
- [ ] Write unit tests for createInvoice validation logic
- [ ] Write integration tests for invoice API routes
```

### Exit Criteria
- Verifiable conditions that a **review agent** can check. Each criterion must be objectively true or false.
- Good: "All invoice API routes return correct status codes", "Migration runs without errors", "Unit tests pass with >90% branch coverage"
- Bad: "Code is clean", "API feels fast", "Good error handling"
- Include at minimum: tests pass, types check, primary happy path works end-to-end.

## Directory Convention

Components are grouped into phase directories by implementation dependency. Components that share data models or have tight coupling go in the same phase directory.

```
docs/detailed_design/
  01_Data_Layer/
    invoice-schema.md
    time-entry-schema.md
  02_Core_Logic/
    invoice-generator.md
    time-tracker.md
  03_API_Surface/
    invoice-api.md
    time-entry-api.md
```

The directory name becomes the **phase name** in the delivery tracker. Number-prefix directories to indicate build order.

## After Writing

Present the completed design document. Flag:
- Any interface decisions you made that weren't specified in the architecture doc
- Tasks that might be larger than a single agent session
- Dependencies on components that don't have designs yet
