import { NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { z } from "zod"

const startProcessSchema = z.object({
  projectId: z.string().min(1),
  processType: z.enum(["dev_server", "test_watcher", "build_watcher", "custom"]),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
})

export async function GET(request: Request) {
  try {
    const db = getDb()
    const url = new URL(request.url)
    const projectId = url.searchParams.get("projectId")
    const processType = url.searchParams.get("processType")

    let query = db.select().from(schema.backgroundProcesses)

    if (projectId) {
      query = query.where(eq(schema.backgroundProcesses.projectId, projectId)) as typeof query
    }
    if (processType) {
      query = query.where(eq(schema.backgroundProcesses.processType, processType)) as typeof query
    }

    const rows = query.all()
    return NextResponse.json(rows)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list processes" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = startProcessSchema.parse(body)

    const db = getDb()

    // Verify project exists and has workspace
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, parsed.projectId))
      .get()

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    if (!project.workspacePath) {
      return NextResponse.json(
        { error: "Project has no workspace" },
        { status: 400 },
      )
    }

    const { getBackgroundProcessManager } = await import(
      "@/lib/process/background-process-manager"
    )
    const bgManager = getBackgroundProcessManager()
    const bgProcess = await bgManager.start(
      parsed.projectId,
      parsed.processType,
      parsed.command,
      parsed.args,
      project.workspacePath,
    )

    return NextResponse.json(
      {
        id: bgProcess.id,
        processType: bgProcess.processType,
        status: bgProcess.status,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start process" },
      { status: 500 },
    )
  }
}
