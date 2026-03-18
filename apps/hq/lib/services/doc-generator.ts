import Anthropic from "@anthropic-ai/sdk"

const MODEL_MAP = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
  haiku: "claude-haiku-4-5-20251001",
} as const

type ModelKey = keyof typeof MODEL_MAP

export interface GeneratedDocs {
  vision: string
  arch: string
  plan: string
  taxonomy: string
  codingStandards: string
}

const SYSTEM_PROMPT = `You are a senior software architect who creates structured project documentation.
You generate clear, actionable documents following a specific format for each document type.
Always output raw markdown content. Do not wrap in code fences.
Be specific and practical — avoid generic filler. Tailor everything to the project described.`

const DOC_PROMPTS = {
  vision: `Generate a VISION.md document for this project. Include:
- Project name and one-line description
- Problem statement (what pain point does this solve?)
- Target users (who uses this and why?)
- Core features (3-7 key capabilities, described concretely)
- Success metrics (measurable outcomes)
- Non-goals (what this project explicitly will NOT do)
- Tech preferences (if mentioned in the prompt, otherwise suggest reasonable defaults)

Format as a clean markdown document with ## headers.`,

  arch: `Generate an ARCH.md (Architecture) document for this project. Include:
- System overview (high-level description of components)
- Component architecture (what the major pieces are and how they connect)
- Data model (key entities and their relationships, described in text or mermaid ERD)
- Tech stack (specific technologies with brief rationale)
- Key decisions (important architectural choices and why)
- Integration points (external services, APIs, data flows)

Use mermaid diagrams where helpful. Format with ## headers.`,

  plan: `Generate a PLAN.md document for this project. Include:
- Current state (starting point)
- Version v0 (MVP) broken into 3-5 phases
- Each phase should have:
  - From/To description (what changes)
  - A table of 3-8 specific tasks
  - Exit criteria (how to know this phase is done)
- A dependency graph showing phase ordering

Be specific about implementation tasks — not vague descriptions. Format with ## headers and markdown tables.`,

  taxonomy: `Generate a TAXONOMY.md document for this project. Include:
- Core entities and their definitions (what they are and what they are NOT)
- Status enums for each entity with meanings
- Naming conventions (database columns, TypeScript, API routes, files, env vars)
- Any domain-specific terminology

Format as markdown with tables for statuses and conventions.`,

  codingStandards: `Generate a CODING-STANDARDS.md document for this project. Include:
- Language and framework conventions (based on the tech stack)
- Code style rules (naming, imports, exports, file structure)
- Error handling approach
- Testing strategy (what to test, how)
- Security considerations
- Git workflow (branch naming, commit messages)

Keep it concise and actionable. Format with ## headers.`,
}

async function generateDoc(
  client: Anthropic,
  model: string,
  projectName: string,
  prompt: string,
  docType: keyof typeof DOC_PROMPTS,
  previousDocs: Partial<GeneratedDocs> = {},
): Promise<string> {
  const contextParts: string[] = []

  if (previousDocs.vision && docType !== "vision") {
    contextParts.push(`## Previously generated VISION.md:\n${previousDocs.vision}`)
  }
  if (previousDocs.arch && !["vision", "arch"].includes(docType)) {
    contextParts.push(`## Previously generated ARCH.md:\n${previousDocs.arch}`)
  }

  const context = contextParts.length > 0
    ? `\n\nUse these previously generated docs for context and consistency:\n\n${contextParts.join("\n\n")}`
    : ""

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Project: "${projectName}"\n\nUser's prompt:\n${prompt}${context}\n\n${DOC_PROMPTS[docType]}`,
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`No text response for ${docType}`)
  }

  return textBlock.text
}

export async function generateProjectDocs(
  projectName: string,
  prompt: string,
  model: ModelKey = "sonnet",
  apiKey?: string,
): Promise<GeneratedDocs> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error("No API key available. Configure your Anthropic key in Settings.")
  }

  const client = new Anthropic({ apiKey: key })
  const modelId = MODEL_MAP[model]
  const docs: Partial<GeneratedDocs> = {}

  // Chain: VISION first → ARCH → PLAN → TAXONOMY and CODING-STANDARDS in parallel
  docs.vision = await generateDoc(client, modelId, projectName, prompt, "vision")
  docs.arch = await generateDoc(client, modelId, projectName, prompt, "arch", docs)
  docs.plan = await generateDoc(client, modelId, projectName, prompt, "plan", docs)

  const [taxonomy, codingStandards] = await Promise.all([
    generateDoc(client, modelId, projectName, prompt, "taxonomy", docs),
    generateDoc(client, modelId, projectName, prompt, "codingStandards", docs),
  ])

  docs.taxonomy = taxonomy
  docs.codingStandards = codingStandards

  return docs as GeneratedDocs
}
