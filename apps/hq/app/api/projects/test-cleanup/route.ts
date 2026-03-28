import { NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq, inArray } from "drizzle-orm"

export async function DELETE() {
  try {
    const db = getDb()

    // Collect test project IDs
    const testProjects = db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.isTest, 1))
      .all()

    if (testProjects.length === 0) {
      return NextResponse.json({ deleted: 0 })
    }

    const ids = testProjects.map((p) => p.id)

    // Delete child rows that lack ON DELETE CASCADE
    db.delete(schema.agentRuns).where(inArray(schema.agentRuns.projectId, ids)).run()
    db.delete(schema.backgroundProcesses).where(inArray(schema.backgroundProcesses.projectId, ids)).run()
    db.delete(schema.kpiSnapshots).where(inArray(schema.kpiSnapshots.projectId, ids)).run()
    db.delete(schema.deployEvents).where(inArray(schema.deployEvents.projectId, ids)).run()
    db.delete(schema.processConfigs).where(inArray(schema.processConfigs.projectId, ids)).run()

    // Delete projects (cascading FKs handle milestones, phases, tasks, releases, chat_messages)
    const result = db
      .delete(schema.projects)
      .where(eq(schema.projects.isTest, 1))
      .run()

    return NextResponse.json({ deleted: result.changes })
  } catch (err) {
    console.error("[DELETE /api/projects/test-cleanup]", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
