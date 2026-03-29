import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { getPlanningEngine } from "@/lib/services/planning-engine"
import type { PlanningProgressEvent } from "@/lib/services/planning-engine"
import { z } from "zod"

type RouteParams = { params: Promise<{ id: string }> }

const planRequestSchema = z.object({
  model: z.string().default("sonnet"),
  collaborationProfile: z
    .enum(["operator", "architect", "full_auto"])
    .default("operator"),
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

  if (!project.workspacePath) {
    return NextResponse.json(
      { error: "Project has no workspace. Create workspace first." },
      { status: 400 },
    )
  }

  const { getAnthropicApiKey } = await import("@/lib/services/secrets")
  const apiKey = getAnthropicApiKey()
  if (!apiKey || apiKey.trim().length === 0) {
    return NextResponse.json(
      { error: "No API key configured. Add your Anthropic key in Settings." },
      { status: 400 },
    )
  }
  if (!apiKey.startsWith("sk-ant-")) {
    return NextResponse.json(
      { error: "Invalid API key format. Check your key in Settings." },
      { status: 400 },
    )
  }

  try {
    const body = await request.json()
    const parsed = planRequestSchema.parse(body)

    // Update project status to planning (if not already)
    if (project.status !== "planning") {
      db.update(schema.projects)
        .set({ status: "planning", updatedAt: new Date().toISOString() })
        .where(eq(schema.projects.id, id))
        .run()
    }

    const encoder = new TextEncoder()

    function persistSystemMessage(content: string, icon: string) {
      db.insert(schema.chatMessages)
        .values({
          id: crypto.randomUUID(),
          projectId: id,
          role: "system",
          content,
          icon,
        })
        .run()
    }

    const STATUS_ICON_MAP: Record<string, string> = {
      running: "running",
      completed: "completed",
      failed: "failed",
      awaiting_review: "info",
    }

    function formatProgressContent(
      level: string,
      status: string,
      detail?: string,
    ): string {
      const label = level.charAt(0).toUpperCase() + level.slice(1)
      if (detail) return `${label}: ${detail}`
      switch (status) {
        case "running":
          return `${label} running...`
        case "completed":
          return `${label} completed`
        case "failed":
          return `${label} failed`
        case "awaiting_review":
          return `${label} awaiting review`
        default:
          return `${label}: ${status}`
      }
    }

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: PlanningProgressEvent) => {
          const icon = STATUS_ICON_MAP[event.status] ?? "info"
          const content = formatProgressContent(
            event.level,
            event.status,
            event.detail,
          )
          persistSystemMessage(content, icon)

          try {
            controller.enqueue(
              encoder.encode(
                `event: progress\ndata: ${JSON.stringify(event)}\n\n`,
              ),
            )
          } catch {
            // stream closed
          }
        }

        try {
          const engine = getPlanningEngine()
          const result = await engine.runPipeline(
            id,
            {
              model: parsed.model,
              apiKey,
              collaborationProfile: parsed.collaborationProfile,
              maxTurns: 50,
              maxBudgetUsd: 5.0,
            },
            emit,
          )

          if (result.awaitingReview) {
            persistSystemMessage(
              `Pipeline paused \u2014 awaiting review of ${result.awaitingReview}`,
              "info",
            )
          } else {
            persistSystemMessage("Planning pipeline completed", "completed")
          }

          controller.enqueue(
            encoder.encode(
              `event: complete\ndata: ${JSON.stringify(result)}\n\n`,
            ),
          )
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Planning pipeline failed"

          persistSystemMessage(`Pipeline error: ${message}`, "failed")

          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: message })}\n\n`,
            ),
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start planning",
      },
      { status: 500 },
    )
  }
}
