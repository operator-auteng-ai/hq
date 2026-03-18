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
    const row = db
      .select()
      .from(schema.backgroundProcesses)
      .where(eq(schema.backgroundProcesses.id, id))
      .get()

    if (!row) {
      return NextResponse.json({ error: "Process not found" }, { status: 404 })
    }

    // Augment with live status if running
    const { getBackgroundProcessManager } = await import(
      "@/lib/process/background-process-manager"
    )
    const bgManager = getBackgroundProcessManager()
    const live = bgManager.getProcess(id)

    return NextResponse.json({
      ...row,
      liveStatus: live?.status ?? null,
      port: live?.port ?? row.port,
      url: live?.url ?? row.url,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get process" },
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
    const { getBackgroundProcessManager } = await import(
      "@/lib/process/background-process-manager"
    )
    const bgManager = getBackgroundProcessManager()
    await bgManager.stop(id)

    return NextResponse.json({ status: "stopped" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to stop process" },
      { status: 500 },
    )
  }
}
