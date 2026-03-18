import { NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const db = getDb()
    const run = db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, id))
      .get()

    if (!run) {
      return NextResponse.json({ error: "Agent run not found" }, { status: 404 })
    }

    return NextResponse.json(run)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get agent" },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { getAgentManager } = await import("@/lib/process/agent-manager")
    const agentManager = getAgentManager()
    const cancelled = agentManager.cancel(id)

    if (!cancelled) {
      // Agent not running in-memory — update DB directly if still queued
      const db = getDb()
      const run = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, id))
        .get()

      if (run && run.status === "queued") {
        db.update(schema.agentRuns)
          .set({ status: "cancelled", completedAt: new Date().toISOString() })
          .where(eq(schema.agentRuns.id, id))
          .run()
        return NextResponse.json({ status: "cancelled" })
      }

      return NextResponse.json(
        { error: "Agent not running or already finished" },
        { status: 404 },
      )
    }

    return NextResponse.json({ status: "cancelling" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel agent" },
      { status: 500 },
    )
  }
}
