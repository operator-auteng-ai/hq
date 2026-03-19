import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { createTestDb, seedProject } from "@/lib/test-helpers"

let mockDb = createTestDb()
vi.mock("@/lib/db", async () => {
  const actualSchema = await vi.importActual<typeof import("@/lib/db/schema")>(
    "@/lib/db/schema",
  )
  return {
    getDb: () => mockDb,
    schema: actualSchema,
  }
})

const { GET, PATCH, DELETE } = await import("./route")

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), init as never)
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("GET /api/projects/:id", () => {
  beforeEach(() => {
    mockDb = createTestDb()
  })

  it("returns a project by ID", async () => {
    const project = seedProject(mockDb, { name: "Findable" })

    const response = await GET(
      makeRequest(`/api/projects/${project.id}`),
      makeParams(project.id),
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.name).toBe("Findable")
    // Phases are now served from /api/projects/:id/phases (parsed from PLAN.md)
    expect(data.phases).toBeUndefined()
  })

  it("returns 404 for non-existent project", async () => {
    const response = await GET(
      makeRequest("/api/projects/nonexistent"),
      makeParams("nonexistent"),
    )

    expect(response.status).toBe(404)
  })
})

describe("PATCH /api/projects/:id", () => {
  beforeEach(() => {
    mockDb = createTestDb()
  })

  it("updates project name", async () => {
    const project = seedProject(mockDb, { name: "Old Name" })

    const response = await PATCH(
      makeRequest(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      }),
      makeParams(project.id),
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.name).toBe("New Name")
  })

  it("updates project status", async () => {
    const project = seedProject(mockDb)

    const response = await PATCH(
      makeRequest(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "planning" }),
      }),
      makeParams(project.id),
    )

    const data = await response.json()
    expect(data.status).toBe("planning")
  })

  it("rejects invalid status", async () => {
    const project = seedProject(mockDb)

    const response = await PATCH(
      makeRequest(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "invalid" }),
      }),
      makeParams(project.id),
    )

    expect(response.status).toBe(400)
  })

  it("returns 404 for non-existent project", async () => {
    const response = await PATCH(
      makeRequest("/api/projects/nonexistent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      }),
      makeParams("nonexistent"),
    )

    expect(response.status).toBe(404)
  })

  it("updates the updatedAt timestamp", async () => {
    const project = seedProject(mockDb)
    const originalUpdatedAt = project.updatedAt

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10))

    const response = await PATCH(
      makeRequest(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      }),
      makeParams(project.id),
    )

    const data = await response.json()
    expect(data.updated_at).not.toBe(originalUpdatedAt)
  })
})

describe("DELETE /api/projects/:id", () => {
  beforeEach(() => {
    mockDb = createTestDb()
  })

  it("soft-deletes by setting status to archived", async () => {
    const project = seedProject(mockDb, { status: "draft" })

    const deleteResponse = await DELETE(
      makeRequest(`/api/projects/${project.id}`, { method: "DELETE" }),
      makeParams(project.id),
    )

    expect(deleteResponse.status).toBe(200)

    // Verify it's archived, not deleted
    const getResponse = await GET(
      makeRequest(`/api/projects/${project.id}`),
      makeParams(project.id),
    )
    const data = await getResponse.json()
    expect(data.status).toBe("archived")
  })

  it("returns 404 for non-existent project", async () => {
    const response = await DELETE(
      makeRequest("/api/projects/nonexistent", { method: "DELETE" }),
      makeParams("nonexistent"),
    )

    expect(response.status).toBe(404)
  })
})
