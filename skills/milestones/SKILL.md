---
name: milestones
description: >
  Decompose a product vision into ordered capability milestones with an MVP
  boundary. Produces a MILESTONES.md with milestone names, descriptions, and
  MVP marker. Use this skill after the vision skill to define what to build
  and in what order.
---

# Milestones Document Skill

Break a product vision into ordered capability milestones with a clear MVP boundary. The output is `docs/MILESTONES.md` — the sequence of capabilities the product must gain to test its hypothesis.

## Input

Read `docs/VISION.md` in the workspace first. The hypothesis and success metric determine what the MVP must include. If VISION.md does not exist, stop and tell the user to run the vision skill first.

## Output

Write `docs/MILESTONES.md` to the workspace. Use this exact structure:

```
# MILESTONES — <Project Name>

## MVP Scope

### M1: <Name>
<one sentence>

### M2: <Name>
<one sentence>

### M3: <Name> <- MVP
<one sentence>

---

## Post-MVP

### M4: <Name>
<one sentence>

### M5: <Name>
<one sentence>
```

## Rules

### Milestones Are Capabilities, Not Tasks
- Each milestone describes something the **user can do** after it ships.
- Good: "User can create and send invoices from tracked time entries"
- Bad: "Set up database and API scaffolding"
- Bad: "Implement backend logic"
- A milestone is done when a user-visible capability exists and works end-to-end.

### MVP Boundary
- The MVP is the **minimum set of milestones that tests the vision's hypothesis**. Nothing more.
- Mark the last MVP milestone with `<- MVP` suffix in its heading.
- If the hypothesis is "freelancers will pay for auto-invoicing from time tracking", the MVP must include time tracking AND invoicing AND a payment mechanism. It does NOT need reporting dashboards, team features, or integrations.

### Ordering
- Order matters. Each milestone builds on the capabilities from previous milestones.
- M1 is always the foundational capability that everything else depends on.
- Do not create milestones that could ship in parallel — if they can, merge them or pick one to go first.

### Sizing
- **3-5 milestones for MVP** is typical.
- **7 or fewer milestones total** (MVP + post-MVP). If you have more than 7, the vision is too broad — suggest the user narrow it.
- Each milestone should be deliverable in 1-3 agent sessions. If a milestone feels like it needs a week of work, split it.

### Descriptions
- Exactly **one sentence** per milestone. Describe the capability from the user's perspective.
- No implementation details. No technology mentions. No task lists.

### Post-MVP
- Post-MVP milestones are things that strengthen the product after the hypothesis is validated.
- These are less defined and that's fine. They exist to show the roadmap direction, not to be planned in detail.

## Re-run / Update Mode

If `docs/MILESTONES.md` already exists, this is a **targeted update**, not a fresh creation.

1. Read the existing `docs/MILESTONES.md` first
2. Check the "Instruction for this run" section in your prompt — it explains what to change
3. Apply **only** the requested change, preserving everything else (milestone names, descriptions, MVP boundary)
4. Do not reorder or rewrite milestones that aren't affected by the instruction
5. If the vision changed, verify the MVP boundary still aligns with the updated hypothesis

## After Writing

Present the completed MILESTONES.md. Call out:
- Why you drew the MVP boundary where you did (link back to the hypothesis)
- Any milestones that felt too large and might need splitting
- Whether the total count suggests the vision might be too broad
