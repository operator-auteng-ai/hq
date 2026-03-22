import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq, asc } from "drizzle-orm"
import { buildProjectContext, loadChatHistory } from "@/lib/services/context-builder"
import { extractActions } from "@/lib/services/action-extractor"
import { getAnthropicApiKey } from "@/lib/services/secrets"
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

  const messages = db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.projectId, id))
    .orderBy(asc(schema.chatMessages.createdAt))
    .all()

  return NextResponse.json({ messages })
}

const chatRequestSchema = z.object({
  message: z.string().min(1),
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

  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured. Add your Anthropic key in Settings." },
      { status: 400 },
    )
  }

  try {
    const body = await request.json()
    const parsed = chatRequestSchema.parse(body)

    // Persist user message
    const userMessageId = crypto.randomUUID()
    db.insert(schema.chatMessages)
      .values({
        id: userMessageId,
        projectId: id,
        role: "user",
        content: parsed.message,
      })
      .run()

    // Build context and history
    const context = buildProjectContext(id)
    const history = loadChatHistory(id, 20)

    // Prepare Anthropic API call
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = ""

        try {
          const apiStream = client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 2048,
            system: context.systemPrompt,
            messages: history.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
          })

          for await (const event of apiStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const text = event.delta.text
              fullResponse += text
              controller.enqueue(
                encoder.encode(
                  `event: token\ndata: ${JSON.stringify({ content: text })}\n\n`,
                ),
              )
            }
          }

          // Extract actions from response
          const actions = extractActions(fullResponse)

          // Persist assistant message
          const assistantMessageId = crypto.randomUUID()
          db.insert(schema.chatMessages)
            .values({
              id: assistantMessageId,
              projectId: id,
              role: "assistant",
              content: fullResponse,
              actionProposed: actions.length > 0
                ? JSON.stringify(actions)
                : null,
            })
            .run()

          // Emit action events
          for (const action of actions) {
            controller.enqueue(
              encoder.encode(
                `event: action\ndata: ${JSON.stringify(action)}\n\n`,
              ),
            )
          }

          // Done
          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({ messageId: assistantMessageId })}\n\n`,
            ),
          )
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Chat request failed"
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
        error: error instanceof Error ? error.message : "Chat failed",
      },
      { status: 500 },
    )
  }
}
