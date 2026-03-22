import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { getDeliveryTracker } from "@/lib/services/delivery-tracker"
import { getOrchestrator } from "@/lib/services/orchestrator"
import { z } from "zod"

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

  const tracker = getDeliveryTracker()
  const tree = tracker.getProjectDeliveryTree(id)

  return NextResponse.json(tree)
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("startTask"),
    taskId: z.string().min(1),
  }),
  z.object({
    action: z.literal("startPhase"),
    phaseId: z.string().min(1),
  }),
  z.object({
    action: z.literal("approvePhase"),
    phaseId: z.string().min(1),
  }),
  z.object({
    action: z.literal("rejectPhase"),
    phaseId: z.string().min(1),
  }),
  z.object({
    action: z.literal("skipTask"),
    taskId: z.string().min(1),
  }),
  z.object({
    action: z.literal("retryTask"),
    taskId: z.string().min(1),
  }),
  z.object({
    action: z.literal("approveMilestone"),
    milestoneId: z.string().min(1),
  }),
  z.object({
    action: z.literal("getPhaseReview"),
    phaseId: z.string().min(1),
  }),
])

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

  try {
    const body = await request.json()
    const parsed = actionSchema.parse(body)
    const orchestrator = getOrchestrator()
    const tracker = getDeliveryTracker()

    switch (parsed.action) {
      case "startTask":
        return NextResponse.json(
          await orchestrator.startTask(parsed.taskId),
        )

      case "startPhase":
        return NextResponse.json(
          await orchestrator.startPhase(parsed.phaseId),
        )

      case "approvePhase":
        return NextResponse.json(
          await orchestrator.approvePhase(parsed.phaseId),
        )

      case "rejectPhase": {
        await orchestrator.rejectPhase(parsed.phaseId)
        return NextResponse.json({
          phaseId: parsed.phaseId,
          status: "active",
        })
      }

      case "skipTask": {
        const task = tracker.updateTaskStatus(parsed.taskId, "skipped")
        return NextResponse.json({ taskId: task.id, status: task.status })
      }

      case "retryTask":
        return NextResponse.json(
          await orchestrator.startTask(parsed.taskId),
        )

      case "approveMilestone":
        return NextResponse.json(
          await orchestrator.approveMilestone(parsed.milestoneId),
        )

      case "getPhaseReview": {
        const phase = db
          .select()
          .from(schema.phases)
          .where(eq(schema.phases.id, parsed.phaseId))
          .get()
        if (!phase) {
          return NextResponse.json(
            { error: "Phase not found" },
            { status: 404 },
          )
        }
        const reviewResult = phase.reviewResult
          ? JSON.parse(phase.reviewResult)
          : null
        return NextResponse.json({ reviewResult })
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 500 },
    )
  }
}
