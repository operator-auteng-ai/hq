---
name: vision
description: >
  Extract a focused product vision from a user prompt. Produces a VISION.md
  with a falsifiable hypothesis, measurable success metric, problem statement,
  solution summary, target user, and explicit non-goals. Use this skill when
  starting a new project to crystallize what the product is betting on.
---

# Vision Document Skill

Distill a user's project prompt into a sharp, one-page product vision. The output is `docs/VISION.md` — the single source of truth for what the product bets on and how that bet will be measured.

## Input

The user's project prompt is provided in your agent prompt. Read it carefully. Your job is to extract the implicit bet, not to echo the prompt back.

## Output

Write `docs/VISION.md` to the workspace. Use this exact structure:

```
# VISION — <Project Name>

## Hypothesis

## Success Metric

## Problem

## Solution

## Target User

## What This Is NOT
```

## Rules

### General
- Every section is **1-3 sentences MAX**. No filler, no padding, no preamble.
- Write in plain declarative statements. No hedging ("we believe", "we hope").

### Hypothesis
- Must be **specific and falsifiable**. A reader should be able to say "that's true" or "that's false" after 90 days.
- Bad: "Build a good invoicing app."
- Good: "Freelancers will pay $15/mo for an invoicing tool that auto-generates invoices from tracked time entries."
- Extract the **implicit bet** from the prompt. The user rarely states their hypothesis directly — figure out what they're actually betting on.

### Success Metric
- Must contain a **number** and a **timeframe**.
- Examples: "50 paying users in 90 days", "500 daily active users within 60 days of launch", "95% task completion rate in user testing by week 4".
- Pick the single metric that would prove the hypothesis true.

### Problem
- State the pain point the target user has today. Be concrete.

### Solution
- One-sentence summary of what the product does to solve the problem. Not a feature list.

### Target User
- Specific persona, not "everyone". Include relevant constraints (budget, technical skill, context of use).

### What This Is NOT
- 2-3 bullets of **explicit non-goals**. Things the product deliberately does not do.
- These prevent scope creep and clarify the bet. Pick non-goals that a reasonable person might assume ARE in scope.

## Handling Vague Prompts

If the user's prompt is vague or broad, **make the hypothesis specific anyway**. Pick the strongest bet you can extract from what they gave you. The user will refine it in review — a specific-but-wrong hypothesis is more useful than a vague-but-safe one.

## Re-run / Update Mode

If `docs/VISION.md` already exists, this is a **targeted update**, not a fresh creation.

1. Read the existing `docs/VISION.md` first
2. Check the "Instruction for this run" section in your prompt — it explains what to change
3. Apply **only** the requested change, preserving everything else
4. Do not rewrite sections that aren't affected by the instruction
5. If no instruction is provided, review and refine the existing document rather than replacing it

## After Writing

Present the completed VISION.md. Call out any assumptions you made and flag sections where you had to guess. The user should review and refine before moving to the milestones skill.
