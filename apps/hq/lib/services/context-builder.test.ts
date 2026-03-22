import { describe, it, expect, beforeEach, vi } from "vitest"
import { createTestDb, seedProject } from "@/lib/test-helpers"
import * as schema from "@/lib/db/schema"
import { eq } from "drizzle-orm"

let testDb: ReturnType<typeof createTestDb>

vi.mock("@/lib/db", async () => {
  const actualSchema = await vi.importActual<typeof import("@/lib/db/schema")>(
    "@/lib/db/schema",
  )
  return {
    getDb: () => testDb,
    schema: actualSchema,
  }
})

describe("buildProjectContext", () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  it("produces system prompt with project name and status", async () => {
    const project = seedProject(testDb, { name: "Invoicer", status: "building" })

    const { buildProjectContext } = await import("./context-builder")
    const context = buildProjectContext(project.id)

    expect(context.systemPrompt).toContain('project "Invoicer"')
    expect(context.systemPrompt).toContain("Project status: building")
    expect(context.tokenEstimate).toBeGreaterThan(0)
  })

  it("includes vision hypothesis and success metric", async () => {
    const project = seedProject(testDb, {
      visionHypothesis: "Freelancers need faster invoicing",
      successMetric: "50 paying users in 90 days",
    })

    const { buildProjectContext } = await import("./context-builder")
    const context = buildProjectContext(project.id)

    expect(context.systemPrompt).toContain("Freelancers need faster invoicing")
    expect(context.systemPrompt).toContain("50 paying users in 90 days")
  })

  it("includes milestone tree with statuses", async () => {
    const project = seedProject(testDb, { status: "building" })

    // Create milestones, phases, tasks
    const milestoneId = crypto.randomUUID()
    testDb.insert(schema.milestones).values({
      id: milestoneId,
      projectId: project.id,
      name: "Core Invoicing",
      sortOrder: 0,
      status: "active",
    }).run()

    const phaseId = crypto.randomUUID()
    testDb.insert(schema.phases).values({
      id: phaseId,
      milestoneId,
      name: "Data Model",
      sortOrder: 0,
      status: "active",
    }).run()

    testDb.insert(schema.tasks).values({
      id: crypto.randomUUID(),
      phaseId,
      title: "Create invoices table",
      sortOrder: 0,
      status: "completed",
    }).run()

    testDb.insert(schema.tasks).values({
      id: crypto.randomUUID(),
      phaseId,
      title: "Add CRUD API",
      sortOrder: 1,
      status: "pending",
    }).run()

    const { buildProjectContext } = await import("./context-builder")
    const context = buildProjectContext(project.id)

    expect(context.systemPrompt).toContain("Core Invoicing")
    expect(context.systemPrompt).toContain("Data Model")
    expect(context.systemPrompt).toContain("Create invoices table")
    expect(context.systemPrompt).toContain("Add CRUD API")
    expect(context.systemPrompt).toContain("completed")
    expect(context.systemPrompt).toContain("pending")
  })

  it("handles project with no milestones", async () => {
    const project = seedProject(testDb)

    const { buildProjectContext } = await import("./context-builder")
    const context = buildProjectContext(project.id)

    expect(context.systemPrompt).toContain("No milestones defined yet")
    expect(context.systemPrompt).toContain("Available Actions")
  })

  it("includes recent failures with truncated output", async () => {
    const project = seedProject(testDb)

    testDb.insert(schema.agentRuns).values({
      id: crypto.randomUUID(),
      projectId: project.id,
      agentType: "claude_code",
      prompt: "test",
      status: "failed",
      output: "Error: Cannot find module 'stripe'",
      completedAt: new Date().toISOString(),
      phaseLabel: "Phase 1",
    }).run()

    const { buildProjectContext } = await import("./context-builder")
    const context = buildProjectContext(project.id)

    expect(context.systemPrompt).toContain("Recent Failures")
    expect(context.systemPrompt).toContain("Cannot find module")
  })

  it("includes available actions section", async () => {
    const project = seedProject(testDb)

    const { buildProjectContext } = await import("./context-builder")
    const context = buildProjectContext(project.id)

    expect(context.systemPrompt).toContain("Available Actions")
    expect(context.systemPrompt).toContain("ACTION:")
    expect(context.systemPrompt).toContain("startTask")
    expect(context.systemPrompt).toContain("retryTask")
    expect(context.systemPrompt).toContain("approvePhase")
  })
})

describe("loadChatHistory", () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  it("loads recent messages ordered by created_at", async () => {
    const project = seedProject(testDb)

    testDb.insert(schema.chatMessages).values({
      id: "msg-1",
      projectId: project.id,
      role: "user",
      content: "First message",
      createdAt: "2026-03-22T10:00:00.000Z",
    }).run()

    testDb.insert(schema.chatMessages).values({
      id: "msg-2",
      projectId: project.id,
      role: "assistant",
      content: "First response",
      createdAt: "2026-03-22T10:00:01.000Z",
    }).run()

    const { loadChatHistory } = await import("./context-builder")
    const history = loadChatHistory(project.id)

    expect(history).toHaveLength(2)
    expect(history[0].role).toBe("user")
    expect(history[0].content).toBe("First message")
    expect(history[1].role).toBe("assistant")
  })

  it("respects limit parameter", async () => {
    const project = seedProject(testDb)

    for (let i = 0; i < 30; i++) {
      testDb.insert(schema.chatMessages).values({
        id: `msg-${i}`,
        projectId: project.id,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      }).run()
    }

    const { loadChatHistory } = await import("./context-builder")
    const history = loadChatHistory(project.id, 5)

    expect(history).toHaveLength(5)
    // Should be the LAST 5 messages
    expect(history[0].content).toBe("Message 25")
  })
})
