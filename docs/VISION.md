# VISION — AutEng HQ

## What It Is

AutEng HQ is a local-first desktop application that takes a product vision and deterministically decomposes it into milestones, architecture, design, and tasks — then orchestrates AI agents to build, deploy, and monitor it until first revenue. You describe what you want to exist; HQ turns it into a product that earns its first dollar.

## The Problem

The gap between "I have an idea" and "someone paid me for it" is enormous — even with AI. You can prompt a model to write code, but nobody has a deterministic process for decomposing a vision into shippable, revenue-generating software. The result: half-built prototypes, incoherent architectures, and products that never reach a customer.

AI agents can write code. What they can't do — without structure — is plan what to build, in what order, with what architecture, down to what tasks. That decomposition is the hard part, and it's what HQ solves.

## The Solution

HQ implements a five-level decomposition methodology. Planning is top-down; building is bottom-up.

**Planning (top-down — AI agents with domain skills produce workspace files):**

1. **Vision** — A hypothesis about what should exist, with a concrete success metric. Not a feature list — a bet.
2. **MVP & Milestones** — Capability checkpoints that test the hypothesis. The MVP boundary defines v1.0. Each milestone answers: "what can the user do now that they couldn't before?"
3. **Architecture** (per milestone) — What components does this milestone need? The architecture evolves as milestones land.
4. **Detailed Design** (per component) — Interfaces, data models, error states. The last design artifact before code.

**Delivery (bottom-up — tracked in HQ's database):**

5. **Tasks → Phases → Milestones → Releases** — Tasks come from the detailed design. Phases group and order them into coherent stages of work. Milestones mark capability completion. Releases stamp versions.

Planning produces files. Delivery consumes a database. The two sides are loosely coupled: milestones define "what's done," releases define "what ships."

## The Methodology

HQ's decomposition follows the framework described in [From Vision to Version Number](./from-vision-to-version-number.html).

The planning side is driven by **skills** — structured prompts installed into agent workspaces that encode domain expertise for each decomposition level. A vision skill knows how to extract a hypothesis and success metric. An architecture skill knows how to identify components for a milestone. A design skill knows how to specify interfaces and error states. Skills make the decomposition repeatable and improvable independent of any single model.

The delivery side is driven by **HQ's database**. Milestones, phases, tasks, and releases are structured entities with statuses, ordering, and relationships. The orchestrator sequences work, assigns agents to tasks, tracks progress, and stamps releases. This replaces the previous approach of parsing phases from markdown at runtime.

## Target Users

High-agency individuals who want to turn a product idea into revenue. Not developers necessarily — operators, founders, and builders who think in outcomes, not code. HQ adapts to each user's expertise via configurable collaboration depth — which levels of the decomposition you want to shape vs. let run autonomously.

### User Profiles

- **Solo builder / Product manager**: Has a product idea ("invoicing for freelancers"), collaborates on vision and milestones, lets agents handle architecture, design, and delivery autonomously
- **Technical founder / Engineer**: Uses HQ to rapidly decompose and validate ideas — collaborates on architecture and design decisions, lets agents handle execution

## Core Principles

1. **Local-first** — HQ runs on your machine. Your data, your control.
2. **Vision-to-revenue** — The goal is $1, not just a deployed product. Every decomposition decision optimizes for reaching a paying customer.
3. **Deterministic decomposition** — HQ follows a repeatable five-level methodology. Same vision, same quality of decomposition, every time.
4. **Skills-driven planning** — Planning is done by agents equipped with domain skills, not by generic prompting. Skills encode expertise and are improvable independently.
5. **Agent-native** — Agents are first-class workers, not assistants. They own tasks.
6. **Open protocols** — MCP for tool integration, standard APIs everywhere.

## What $1 Looks Like

A user types: *"Freelancers should be able to create invoices, send them to clients, and get paid online."*

HQ decomposes this:

- **Vision**: Freelancers get paid faster with less friction. Success metric: 50 paying users in 90 days.
- **Milestones**: M1 Core invoicing (create + send), M2 Payments (Stripe), M3 Dashboard (revenue tracking). M1–M3 = MVP = v1.0.
- **Architecture for M2**: Next.js frontend, API routes, payment service layer (Stripe adapter, webhook handler, ledger service), Postgres, job queue.
- **Design for Stripe adapter**: `createCheckout()`, `handleWebhook()`, `getPaymentStatus()`, `refund()`. Payments table. Error states: Stripe timeout (retry 3x), webhook replay (idempotent), card declined (notify user).
- **Tasks for M2**: Create payments table + migration, Stripe SDK setup, adapter interface, pay button UI, webhook endpoint, status pipeline, email notification, idempotency, retry logic, refund flow, integration tests.

Agents execute tasks through phases (e.g., "Data Model & API", "Payment Flow", "Error Handling & Tests"). When M3 completes, HQ deploys v1.0. When the first freelancer signs up and pays for the tool, that's $1.

## Pricing

**Free and open source.** HQ itself costs nothing. Users pay for the services agents consume:

- **AI**: API costs for Claude, Codex, or other models
- **Infrastructure**: Cloud hosting costs for deployed projects (Vercel, AWS, etc.)
- **Tooling**: MCP services, x402 APIs

HQ is the free cockpit; the engines have their own meters.

## Success Metrics

| Metric | Target |
|--------|--------|
| Time from vision to deployed MVP | < 4 hours for mid-complexity SaaS |
| Plans reaching deployed MVP without human code intervention | > 80% |
| Time from deployed MVP to first dollar | < 7 days (depends on product, not HQ) |

## What HQ Is NOT

- Not an IDE (agents use their own tools: Claude Code, Codex CLI)
- Not a hosting platform (it deploys to existing platforms)
- Not a no-code builder (it generates real code via agents)
- Not a chat interface (it's a dashboard and orchestrator)
- Not a project management tool (milestones and tasks are structured artifacts in a decomposition methodology, not a Jira board)
