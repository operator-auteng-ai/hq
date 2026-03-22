import { NextRequest, NextResponse } from "next/server"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"
import { getDeliveryTracker } from "@/lib/services/delivery-tracker"
import { z } from "zod"

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

  const tracker = getDeliveryTracker()
  const releases = tracker.getReleases(id)

  const releasesWithMilestones = releases.map((release) => ({
    ...release,
    milestones: tracker.getReleaseMilestoneIds(release.id),
  }))

  return NextResponse.json({ releases: releasesWithMilestones })
}

const createReleaseSchema = z.object({
  versionLabel: z.string().min(1),
  milestoneIds: z.array(z.string().min(1)),
  notes: z.string().optional(),
  publish: z.boolean().optional(),
})

export async function POST(request: NextRequest, { params }: RouteParams) {
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

  try {
    const body = await request.json()
    const parsed = createReleaseSchema.parse(body)

    const tracker = getDeliveryTracker()
    const release = tracker.createRelease(
      id,
      parsed.versionLabel,
      parsed.milestoneIds,
      parsed.notes,
    )

    if (parsed.publish) {
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "")
      const shortId = release.id.slice(0, 7)
      const tag = `${parsed.versionLabel}-${dateStr}-${shortId}`
      const published = tracker.publishRelease(release.id, tag)
      return NextResponse.json(published, { status: 201 })
    }

    return NextResponse.json(release, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create release",
      },
      { status: 500 },
    )
  }
}
