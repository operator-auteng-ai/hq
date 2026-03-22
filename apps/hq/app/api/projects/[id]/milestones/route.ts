import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { getDeliveryTracker } from "@/lib/services/delivery-tracker"
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
    const tracker = getDeliveryTracker()

    switch (parsed.action) {
      case "startTask": {
        const task = tracker.updateTaskStatus(parsed.taskId, "in_progress")
        // Ensure phase and milestone are active
        const phase = db
          .select()
          .from(schema.phases)
          .where(eq(schema.phases.id, task.phaseId))
          .get()
        if (phase && phase.status === "pending") {
          tracker.updatePhaseStatus(phase.id, "active")
          const milestone = db
            .select()
            .from(schema.milestones)
            .where(eq(schema.milestones.id, phase.milestoneId))
            .get()
          if (milestone && milestone.status === "pending") {
            tracker.updateMilestoneStatus(milestone.id, "active")
          }
        }
        return NextResponse.json({ taskId: task.id, status: task.status })
      }

      case "startPhase": {
        const tasks = tracker.getTasks(parsed.phaseId)
        const pendingTasks = tasks.filter((t) => t.status === "pending")
        if (pendingTasks.length === 0) {
          return NextResponse.json(
            { error: "No pending tasks in this phase" },
            { status: 400 },
          )
        }
        // Activate the phase
        const phase = db
          .select()
          .from(schema.phases)
          .where(eq(schema.phases.id, parsed.phaseId))
          .get()
        if (phase && phase.status === "pending") {
          tracker.updatePhaseStatus(phase.id, "active")
          const milestone = db
            .select()
            .from(schema.milestones)
            .where(eq(schema.milestones.id, phase.milestoneId))
            .get()
          if (milestone && milestone.status === "pending") {
            tracker.updateMilestoneStatus(milestone.id, "active")
          }
        }
        return NextResponse.json({
          phaseId: parsed.phaseId,
          pendingTasks: pendingTasks.length,
        })
      }

      case "approvePhase": {
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
        // Force-approve: allow from reviewing, review_failed, or active
        if (
          phase.status === "reviewing" ||
          phase.status === "review_failed"
        ) {
          db.update(schema.phases)
            .set({
              status: "completed",
              completedAt: new Date().toISOString(),
            })
            .where(eq(schema.phases.id, parsed.phaseId))
            .run()
          tracker.checkMilestoneCompletion(phase.milestoneId)
        } else if (phase.status !== "completed") {
          return NextResponse.json(
            { error: `Cannot approve phase in status: ${phase.status}` },
            { status: 400 },
          )
        }

        // Find next phase
        const allPhases = tracker.getPhases(phase.milestoneId)
        const currentIdx = allPhases.findIndex((p) => p.id === parsed.phaseId)
        const nextPhase = allPhases[currentIdx + 1]

        return NextResponse.json({ nextPhaseId: nextPhase?.id })
      }

      case "rejectPhase": {
        tracker.resetPhaseForRework(parsed.phaseId)
        return NextResponse.json({
          phaseId: parsed.phaseId,
          status: "active",
        })
      }

      case "skipTask": {
        const task = tracker.updateTaskStatus(parsed.taskId, "skipped")
        return NextResponse.json({ taskId: task.id, status: task.status })
      }

      case "retryTask": {
        const task = tracker.updateTaskStatus(parsed.taskId, "in_progress")
        return NextResponse.json({ taskId: task.id, status: task.status })
      }

      case "approveMilestone": {
        const milestone = tracker.updateMilestoneStatus(
          parsed.milestoneId,
          "completed",
        )
        // Find next milestone
        const allMilestones = tracker.getMilestones(id)
        const currentIdx = allMilestones.findIndex(
          (m) => m.id === parsed.milestoneId,
        )
        const nextMilestone = allMilestones[currentIdx + 1]

        return NextResponse.json({
          milestoneId: milestone.id,
          nextMilestoneId: nextMilestone?.id,
        })
      }

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
