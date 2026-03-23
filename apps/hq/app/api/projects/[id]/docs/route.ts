import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import fs from "node:fs"
import path from "node:path"

type RouteParams = { params: Promise<{ id: string }> }

const DOC_FILES = [
  { key: "vision", filename: "VISION.md" },
  { key: "milestones", filename: "MILESTONES.md" },
  { key: "arch", filename: "ARCH.md" },
  { key: "plan", filename: "PLAN.md" },
  { key: "taxonomy", filename: "TAXONOMY.md" },
  { key: "codingStandards", filename: "CODING-STANDARDS.md" },
] as const

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

  if (!project.workspacePath) {
    return NextResponse.json(
      { error: "No workspace — docs not yet generated" },
      { status: 404 },
    )
  }

  const docsDir = path.join(project.workspacePath, "docs")
  const docs: Record<string, string | null> = {}

  for (const { key, filename } of DOC_FILES) {
    const filePath = path.join(docsDir, filename)
    try {
      docs[key] = fs.readFileSync(filePath, "utf-8")
    } catch {
      docs[key] = null
    }
  }

  return NextResponse.json(docs)
}
