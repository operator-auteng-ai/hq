import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { updateProjectSchema } from "@/lib/validations/project"
import { eq } from "drizzle-orm"

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

  return NextResponse.json(project)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getDb()

  const existing = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get()

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const body = await request.json()
  const parsed = updateProjectSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  db.update(schema.projects)
    .set({
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.projects.id, id))
    .run()

  const updated = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get()

  return NextResponse.json(updated)
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getDb()

  const existing = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get()

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  db.update(schema.projects)
    .set({
      status: "archived",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.projects.id, id))
    .run()

  return NextResponse.json({ success: true })
}
