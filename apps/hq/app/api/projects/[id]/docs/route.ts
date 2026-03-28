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
  { key: "codingStandards", filename: "CODING_STANDARDS.md" },
] as const

interface DocFile {
  path: string
  content: string
}

function collectMarkdownFiles(dir: string, basePath: string): DocFile[] {
  const results: DocFile[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...collectMarkdownFiles(fullPath, basePath))
      } else if (entry.name.endsWith(".md")) {
        const relativePath = path.relative(basePath, fullPath)
        results.push({
          path: relativePath,
          content: fs.readFileSync(fullPath, "utf-8"),
        })
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return results
}

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
  const docs: Record<string, unknown> = {}

  for (const { key, filename } of DOC_FILES) {
    const filePath = path.join(docsDir, filename)
    try {
      docs[key] = fs.readFileSync(filePath, "utf-8")
    } catch {
      docs[key] = null
    }
  }

  // Collect arch delta files from docs/milestones/*/ARCH.md (and any nested .md)
  const milestonesDir = path.join(docsDir, "milestones")
  docs.archDeltas = collectMarkdownFiles(milestonesDir, docsDir)
    .filter((f) => f.path.toUpperCase().includes("ARCH"))

  // Collect design docs from docs/detailed_design/**/*.md
  const designDir = path.join(docsDir, "detailed_design")
  docs.designDocs = collectMarkdownFiles(designDir, docsDir)

  return NextResponse.json(docs)
}
