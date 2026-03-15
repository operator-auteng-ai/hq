import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { createTestDb, seedProject } from "@/lib/test-helpers"

// Mock the db module — vi.mock is hoisted, so we set up a mutable ref
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

// Import after mocking
const { GET, POST } = await import("./route")

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), init as never)
}

describe("GET /api/projects", () => {
  beforeEach(() => {
    mockDb = createTestDb()
  })

  it("returns empty array when no projects exist", async () => {
    const response = await GET(makeRequest("/api/projects"))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual([])
  })

  it("returns all projects", async () => {
    seedProject(mockDb, { name: "Project A" })
    seedProject(mockDb, { name: "Project B" })

    const response = await GET(makeRequest("/api/projects"))
    const data = await response.json()

    expect(data).toHaveLength(2)
  })

  it("filters projects by status", async () => {
    seedProject(mockDb, { name: "Draft", status: "draft" })
    seedProject(mockDb, { name: "Planning", status: "planning" })
    seedProject(mockDb, { name: "Building", status: "building" })

    const response = await GET(makeRequest("/api/projects?status=draft"))
    const data = await response.json()

    expect(data).toHaveLength(1)
    expect(data[0].name).toBe("Draft")
  })

  it("returns all projects when status=all", async () => {
    seedProject(mockDb, { status: "draft" })
    seedProject(mockDb, { status: "planning" })

    const response = await GET(makeRequest("/api/projects?status=all"))
    const data = await response.json()

    expect(data).toHaveLength(2)
  })
})

describe("POST /api/projects", () => {
  beforeEach(() => {
    mockDb = createTestDb()
  })

  it("creates a project with valid input", async () => {
    const response = await POST(
      makeRequest("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Project",
          prompt: "Build something amazing and interesting for users.",
          model: "sonnet",
        }),
      }),
    )

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.name).toBe("New Project")
    expect(data.status).toBe("draft")
    expect(data.id).toBeDefined()
  })

  it("rejects invalid input (short prompt)", async () => {
    const response = await POST(
      makeRequest("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test",
          prompt: "Too short",
        }),
      }),
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe("Validation failed")
  })

  it("rejects missing name", async () => {
    const response = await POST(
      makeRequest("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "A valid prompt that is long enough for validation.",
        }),
      }),
    )

    expect(response.status).toBe(400)
  })

  it("persists the project to the database", async () => {
    await POST(
      makeRequest("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Persisted",
          prompt: "This project should be persisted to the database.",
        }),
      }),
    )

    const response = await GET(makeRequest("/api/projects"))
    const data = await response.json()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe("Persisted")
  })
})
