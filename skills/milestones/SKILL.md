---
name: milestones
description: >
  Decompose a product vision into ordered capability milestones with an MVP
  boundary. Writes milestones directly to the HQ database via the
  mcp__hq__set_milestones tool. Use this skill after the vision skill to
  define what to build and in what order.
---

# Milestones Skill

Break a product vision into ordered capability milestones with a clear MVP boundary. Milestones are the sequence of user-visible capabilities the product must gain to test its hypothesis.

## Storage model

Milestones live in the HQ database, not in a markdown file. You will read and write them through two MCP tools:

- `mcp__hq__list_milestones` — returns the current milestones for this project (name, description, MVP flag, sort order, status). Call this first in re-run mode.
- `mcp__hq__set_milestones` — replaces the project's milestones with the ordered list you provide. Existing milestones keyed by the same name keep their id and status; missing names are deleted; new names are inserted as `pending`.

HQ will render a human-readable `docs/MILESTONES.md` from the database after you finish — do **not** write that file yourself. It is output-only and will be overwritten.

## Input

Read `docs/VISION.md` in the workspace first. The hypothesis and success metric determine what the MVP must include. If VISION.md does not exist, stop and tell the user to run the vision skill first.

## Output

Call `mcp__hq__set_milestones` exactly once, passing the complete ordered list of milestones. Each milestone is an object:

```json
{
  "name": "Photo Onboarding",
  "description": "User can upload a clothed full-body photo that the app accepts, validates, and stores as the base for try-on.",
  "isMvpBoundary": false
}
```

Array order determines the sort order (first item is M1, second is M2, etc.). Exactly one milestone must have `isMvpBoundary: true` — the last milestone of the MVP scope.

## Rules

### Milestones Are Capabilities, Not Tasks
- Each milestone describes something the **user can do** after it ships.
- Good: "User can create and send invoices from tracked time entries"
- Bad: "Set up database and API scaffolding"
- Bad: "Implement backend logic"
- A milestone is done when a user-visible capability exists and works end-to-end.

### MVP Boundary
- The MVP is the **minimum set of milestones that tests the vision's hypothesis**. Nothing more.
- Mark exactly one milestone with `isMvpBoundary: true` — the last milestone of the MVP scope.
- If the hypothesis is "freelancers will pay for auto-invoicing from time tracking", the MVP must include time tracking AND invoicing AND a payment mechanism. It does NOT need reporting dashboards, team features, or integrations.

### Ordering
- Order matters. Each milestone builds on the capabilities from previous milestones.
- The first milestone is always the foundational capability that everything else depends on.
- Do not create milestones that could ship in parallel — if they can, merge them or pick one to go first.

### Sizing
- **3–5 milestones for MVP** is typical.
- **7 or fewer milestones total** (MVP + post-MVP). If you have more than 7, the vision is too broad — suggest the user narrow it.
- Each milestone should be deliverable in 1–3 agent sessions. If a milestone feels like it needs a week of work, split it.

### Descriptions
- Exactly **one sentence** per milestone. Describe the capability from the user's perspective.
- No implementation details. No technology mentions. No task lists.

### Post-MVP
- Post-MVP milestones are things that strengthen the product after the hypothesis is validated.
- These are less defined and that's fine. They exist to show the roadmap direction, not to be planned in detail.
- Include them in the same `set_milestones` call, ordered after the MVP boundary.

## Re-run / Update Mode

If milestones already exist for this project, this is a **targeted update**, not a fresh creation.

1. Call `mcp__hq__list_milestones` to see the current state
2. Check the "Instruction for this run" section in your prompt — it explains what to change
3. Apply **only** the requested change. For milestones you are not changing, pass them through unchanged (same name, same description, same MVP flag)
4. Call `mcp__hq__set_milestones` with the complete updated list

Notes on re-run semantics:
- Milestones whose `name` is unchanged keep their database id and status. Status is preserved across re-runs — an "active" or "completed" milestone stays that way.
- Renaming a milestone (changing its `name`) is treated as delete + create. The new milestone will be `pending` again, losing any prior status. Avoid rename unless intentional.
- Do not reorder milestones that aren't affected by the instruction.
- If the vision changed, verify the MVP boundary still aligns with the updated hypothesis.

## After Writing

After `set_milestones` returns, present a summary to the user. Call out:
- Why you drew the MVP boundary where you did (link back to the hypothesis)
- Any milestones that felt too large and might need splitting
- Whether the total count suggests the vision might be too broad
