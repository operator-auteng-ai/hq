import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { createProjectSchema } from "@/lib/validations/project"
import { eq } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const db = getDb()
  const status = request.nextUrl.searchParams.get("status")

  let query = db.select().from(schema.projects)

  if (status && status !== "all") {
    query = query.where(eq(schema.projects.status, status)) as typeof query
  }

  const rows = query.orderBy(schema.projects.createdAt).all().reverse()
  return NextResponse.json(rows)
}

export async function POST(request: NextRequest) {
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

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get()

  return NextResponse.json(project, { status: 201 })
}
