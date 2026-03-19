import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { parsePhasesFromPlan, parsePhaseStatus } from "@/lib/services/phase-parser"
import fs from "node:fs"
import path from "node:path"

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getDb()

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get()

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (!project.workspacePath) {
    return NextResponse.json([])
  }

  const planPath = path.join(project.workspacePath, "docs", "PLAN.md")
  if (!fs.existsSync(planPath)) {
    return NextResponse.json([])
  }

  const planContent = fs.readFileSync(planPath, "utf-8")
  const phases = parsePhasesFromPlan(planContent)

  // Try to read progress log for phase statuses
  const progressLogPath = path.join(project.workspacePath, "docs", "PLAN_PROGRESS_LOG.md")
  if (fs.existsSync(progressLogPath)) {
    const progressLog = fs.readFileSync(progressLogPath, "utf-8")
    for (const phase of phases) {
      phase.status = parsePhaseStatus(progressLog, phase.phaseNumber)
    }
  }

  return NextResponse.json(phases)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getDb()

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get()

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const body = await request.json()
  const { phaseNumber, action } = body as { phaseNumber: number; action: string }

  if (!phaseNumber || !action) {
    return NextResponse.json({ error: "phaseNumber and action required" }, { status: 400 })
  }

  const { getOrchestrator } = await import("@/lib/services/orchestrator")
  const orchestrator = getOrchestrator()

  if (action === "start") {
    try {
      const agentId = await orchestrator.startPhase(id, phaseNumber)
      return NextResponse.json({ agentId })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to start phase" },
        { status: 500 },
      )
    }
  }

  const result = await orchestrator.handlePhaseAction(
    id,
    phaseNumber,
    action as "approve" | "reject" | "skip",
  )

  return NextResponse.json(result)
}
