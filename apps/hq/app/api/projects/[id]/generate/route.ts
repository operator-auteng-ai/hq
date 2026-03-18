import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { generateProjectDocs } from "@/lib/services/doc-generator"
import { createWorkspace } from "@/lib/services/workspace"
import { getAnthropicApiKey } from "@/lib/services/secrets"

type RouteParams = { params: Promise<{ id: string }> }

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

  const body = await request.json().catch(() => ({}))
  const model = (body.model as "sonnet" | "opus" | "haiku") || "sonnet"

  // Pre-flight check: verify API key exists before starting generation
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured. Add your Anthropic key in Settings." },
      { status: 400 },
    )
  }

  // Update status to planning
  db.update(schema.projects)
    .set({ status: "planning", updatedAt: new Date().toISOString() })
    .where(eq(schema.projects.id, id))
    .run()

  // Stream progress via SSE
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        )
      }

      try {
        send("status", { step: "generating", message: "Generating workflow docs..." })

        const docs = await generateProjectDocs(project.name, project.prompt, model, apiKey)

        send("status", { step: "workspace", message: "Creating project workspace..." })

        const { workspacePath } = await createWorkspace(project.name, docs)

        // Update project with workspace path
        db.update(schema.projects)
          .set({
            status: "planning",
            workspacePath,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.projects.id, id))
          .run()

        send("complete", {
          workspacePath,
          docs: {
            vision: docs.vision.substring(0, 200) + "...",
            arch: docs.arch.substring(0, 200) + "...",
            plan: docs.plan.substring(0, 200) + "...",
            taxonomy: docs.taxonomy.substring(0, 200) + "...",
            codingStandards: docs.codingStandards.substring(0, 200) + "...",
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"

        // Revert status on failure
        db.update(schema.projects)
          .set({ status: "draft", updatedAt: new Date().toISOString() })
          .where(eq(schema.projects.id, id))
          .run()

        send("error", { message })
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
}
