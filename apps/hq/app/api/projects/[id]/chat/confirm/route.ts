import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { getDeliveryTracker } from "@/lib/services/delivery-tracker"
import type { ProposedAction } from "@/lib/services/action-extractor"
import { z } from "zod"

type RouteParams = { params: Promise<{ id: string }> }

const confirmSchema = z.object({
  messageId: z.string().min(1),
  confirm: z.boolean(),
})

export async function POST(request: NextRequest, { params }: RouteParams) {
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
    const parsed = confirmSchema.parse(body)

    const message = db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, parsed.messageId))
      .get()

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 },
      )
    }

    if (!message.actionProposed) {
      return NextResponse.json(
        { error: "No action proposed in this message" },
        { status: 400 },
      )
    }

    if (message.actionExecuted) {
      return NextResponse.json(
        { error: "Action already executed" },
        { status: 400 },
      )
    }

    if (!parsed.confirm) {
      return NextResponse.json({ executed: false })
    }

    // Execute the action
    const actions = JSON.parse(message.actionProposed) as ProposedAction[]
    const tracker = getDeliveryTracker()
    const results: Array<{ action: string; result: unknown }> = []

    for (const action of actions) {
      try {
        switch (action.action) {
          case "startTask":
            tracker.updateTaskStatus(action.entityId, "in_progress")
            results.push({ action: action.action, result: { taskId: action.entityId, status: "in_progress" } })
            break

          case "retryTask":
            tracker.updateTaskStatus(action.entityId, "in_progress")
            results.push({ action: action.action, result: { taskId: action.entityId, status: "in_progress" } })
            break

          case "skipTask":
            tracker.updateTaskStatus(action.entityId, "skipped")
            results.push({ action: action.action, result: { taskId: action.entityId, status: "skipped" } })
            break

          case "approvePhase": {
            const phase = db
              .select()
              .from(schema.phases)
              .where(eq(schema.phases.id, action.entityId))
              .get()
            if (phase && (phase.status === "reviewing" || phase.status === "review_failed")) {
              db.update(schema.phases)
                .set({ status: "completed", completedAt: new Date().toISOString() })
                .where(eq(schema.phases.id, action.entityId))
                .run()
              tracker.checkMilestoneCompletion(phase.milestoneId)
            }
            results.push({ action: action.action, result: { phaseId: action.entityId, status: "completed" } })
            break
          }

          case "rejectPhase":
            tracker.resetPhaseForRework(action.entityId)
            results.push({ action: action.action, result: { phaseId: action.entityId, status: "active" } })
            break

          case "approveMilestone":
            tracker.updateMilestoneStatus(action.entityId, "completed")
            results.push({ action: action.action, result: { milestoneId: action.entityId, status: "completed" } })
            break

          case "startPhase": {
            const phase = db
              .select()
              .from(schema.phases)
              .where(eq(schema.phases.id, action.entityId))
              .get()
            if (phase && phase.status === "pending") {
              tracker.updatePhaseStatus(action.entityId, "active")
              const milestone = db
                .select()
                .from(schema.milestones)
                .where(eq(schema.milestones.id, phase.milestoneId))
                .get()
              if (milestone && milestone.status === "pending") {
                tracker.updateMilestoneStatus(milestone.id, "active")
              }
            }
            results.push({ action: action.action, result: { phaseId: action.entityId, status: "active" } })
            break
          }

          default:
            results.push({ action: action.action, result: { error: `Unsupported action: ${action.action}` } })
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Action failed"
        results.push({ action: action.action, result: { error: message } })
      }
    }

    // Mark action as executed
    db.update(schema.chatMessages)
      .set({ actionExecuted: 1 })
      .where(eq(schema.chatMessages.id, parsed.messageId))
      .run()

    return NextResponse.json({ executed: true, results })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Confirm failed",
      },
      { status: 500 },
    )
  }
}
