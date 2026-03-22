import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { createProjectSchema } from "@/lib/validations/project"
import { eq } from "drizzle-orm"
import { createWorkspace } from "@/lib/services/workspace"

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const status = request.nextUrl.searchParams.get("status")

    let query = db.select().from(schema.projects)

    if (status && status !== "all") {
      query = query.where(eq(schema.projects.status, status)) as typeof query
    }

    const rows = query.orderBy(schema.projects.createdAt).all().reverse()
    return NextResponse.json(rows)
  } catch (err) {
    console.error("[GET /api/projects]", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createProjectSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const db = getDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    db.insert(schema.projects)
      .values({
        id,
        name: parsed.data.name,
        prompt: parsed.data.prompt,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // Create workspace on disk (non-fatal — project exists even if workspace fails)
    try {
      const { workspacePath } = await createWorkspace(parsed.data.name)
      db.update(schema.projects)
        .set({ workspacePath, updatedAt: new Date().toISOString() })
        .where(eq(schema.projects.id, id))
        .run()
    } catch (wsErr) {
      console.error(`[POST /api/projects] Workspace creation failed:`, wsErr)
    }

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get()

    if (!project) {
      return NextResponse.json(
        { error: "Failed to create project" },
        { status: 500 },
      )
    }

    return NextResponse.json(project, { status: 201 })
  } catch (err) {
    console.error("[POST /api/projects]", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
