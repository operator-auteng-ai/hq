import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { getDeliveryTracker } from "@/lib/services/delivery-tracker"

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getDb()
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const tracker = getDeliveryTracker()
  const tree = tracker.getProjectDeliveryTree(id)
  return NextResponse.json(tree)
}
