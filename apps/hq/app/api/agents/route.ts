import { NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq, and } from "drizzle-orm"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"
import { getAnthropicApiKey } from "@/lib/services/secrets"

const spawnAgentSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1),
  taskId: z.string().optional(),
  phaseLabel: z.string().optional(),
  phaseNumber: z.number().int().positive().optional(),
  model: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  maxBudgetUsd: z.number().positive().optional(),
})

export async function GET(request: Request) {
  try {
    const db = getDb()
    const url = new URL(request.url)
    const projectId = url.searchParams.get("projectId")
    const status = url.searchParams.get("status")

    if (projectId) {
      const conditions = status
        ? and(eq(schema.agentRuns.projectId, projectId), eq(schema.agentRuns.status, status))
        : eq(schema.agentRuns.projectId, projectId)
      const rows = db.select().from(schema.agentRuns).where(conditions).all()
      return NextResponse.json(rows)
    }

    // Global view: join project name for cross-project context
    const conditions = status ? eq(schema.agentRuns.status, status) : undefined
    const rows = db
      .select({
        id: schema.agentRuns.id,
        projectId: schema.agentRuns.projectId,
        projectName: schema.projects.name,
        taskId: schema.agentRuns.taskId,
        phaseLabel: schema.agentRuns.phaseLabel,
        agentType: schema.agentRuns.agentType,
        prompt: schema.agentRuns.prompt,
        status: schema.agentRuns.status,
        model: schema.agentRuns.model,
        maxTurns: schema.agentRuns.maxTurns,
        budgetUsd: schema.agentRuns.budgetUsd,
        costUsd: schema.agentRuns.costUsd,
        turnCount: schema.agentRuns.turnCount,
        sessionId: schema.agentRuns.sessionId,
        output: schema.agentRuns.output,
        createdAt: schema.agentRuns.createdAt,
        completedAt: schema.agentRuns.completedAt,
      })
      .from(schema.agentRuns)
      .leftJoin(schema.projects, eq(schema.agentRuns.projectId, schema.projects.id))
      .where(conditions)
      .all()

    return NextResponse.json(rows)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list agents" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = spawnAgentSchema.parse(body)

    const db = getDb()

    // Verify project exists
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, parsed.projectId))
      .get()
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Pre-flight check: verify API key exists before spawning
    const apiKey = getAnthropicApiKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: "No API key configured. Add your Anthropic key in Settings." },
        { status: 400 },
      )
    }

    const agentId = uuidv4()

    // Create agent run record
    db.insert(schema.agentRuns)
      .values({
        id: agentId,
        projectId: parsed.projectId,
        taskId: parsed.taskId ?? null,
        phaseLabel: parsed.phaseLabel ?? (parsed.phaseNumber ? `Phase ${parsed.phaseNumber}` : null),
        agentType: "claude_code",
        prompt: parsed.prompt,
        status: "queued",
        model: parsed.model ?? "sonnet",
        maxTurns: parsed.maxTurns ?? 50,
        budgetUsd: parsed.maxBudgetUsd ?? 5.0,
      })
      .run()

    // Spawn the agent asynchronously
    const { getAgentManager } = await import("@/lib/process/agent-manager")
    const agentManager = getAgentManager()
    agentManager
      .spawn(agentId, parsed.projectId, parsed.prompt, {
        model: parsed.model,
        maxTurns: parsed.maxTurns,
        maxBudgetUsd: parsed.maxBudgetUsd,
        phaseLabel: parsed.phaseLabel ?? (parsed.phaseNumber ? `Phase ${parsed.phaseNumber}` : undefined),
        apiKey,
      })
      .catch((err: unknown) => {
        console.error(`Agent ${agentId} spawn failed:`, err)
      })

    return NextResponse.json({ agentId }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to spawn agent" },
      { status: 500 },
    )
  }
}
