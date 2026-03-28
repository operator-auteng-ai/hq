import { describe, it, expect, beforeEach, vi } from "vitest"
import { createTestDb, seedProject } from "@/lib/test-helpers"
import * as schema from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

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

describe("chat UX: system messages persist across refresh", () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  it("system messages are stored with role='system' and icon", () => {
    const project = seedProject(testDb)

    testDb.insert(schema.chatMessages).values({
      id: "sys-1",
      projectId: project.id,
      role: "system",
      content: "Vision running...",
      icon: "running",
    }).run()

    const msg = testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, "sys-1"))
      .get()

    expect(msg).toBeDefined()
    expect(msg!.role).toBe("system")
    expect(msg!.icon).toBe("running")
    expect(msg!.content).toBe("Vision running...")
  })

  it("system messages load alongside user/assistant messages", () => {
    const project = seedProject(testDb)

    testDb.insert(schema.chatMessages).values({
      id: "user-1",
      projectId: project.id,
      role: "user",
      content: "Update the vision",
      createdAt: "2026-03-28T10:00:00.000Z",
    }).run()

    testDb.insert(schema.chatMessages).values({
      id: "assistant-1",
      projectId: project.id,
      role: "assistant",
      content: "I'll re-run the vision skill.\n\nACTION: runSkill vision",
      createdAt: "2026-03-28T10:00:01.000Z",
    }).run()

    testDb.insert(schema.chatMessages).values({
      id: "sys-1",
      projectId: project.id,
      role: "system",
      content: "Vision agent running...",
      icon: "running",
      createdAt: "2026-03-28T10:00:02.000Z",
    }).run()

    const messages = testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.projectId, project.id))
      .all()

    expect(messages).toHaveLength(3)
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "system"])
  })

  it("system messages are excluded from chat history sent to Claude API", async () => {
    const project = seedProject(testDb)

    testDb.insert(schema.chatMessages).values({
      id: "user-1",
      projectId: project.id,
      role: "user",
      content: "Hello",
      createdAt: "2026-03-28T10:00:00.000Z",
    }).run()

    testDb.insert(schema.chatMessages).values({
      id: "sys-1",
      projectId: project.id,
      role: "system",
      content: "Vision running...",
      icon: "running",
      createdAt: "2026-03-28T10:00:01.000Z",
    }).run()

    testDb.insert(schema.chatMessages).values({
      id: "assistant-1",
      projectId: project.id,
      role: "assistant",
      content: "Hi there",
      createdAt: "2026-03-28T10:00:02.000Z",
    }).run()

    const { loadChatHistory } = await import("./context-builder")
    const history = loadChatHistory(project.id)

    expect(history).toHaveLength(2)
    expect(history.every((m) => m.role !== "system")).toBe(true)
    expect(history[0].content).toBe("Hello")
    expect(history[1].content).toBe("Hi there")
  })
})

describe("chat UX: agent lifecycle system messages", () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  it("running message transitions to completed when agent finishes", () => {
    const project = seedProject(testDb)

    // Simulate confirm route inserting "running" message
    testDb.insert(schema.chatMessages).values({
      id: "sys-running",
      projectId: project.id,
      role: "system",
      content: "Vision agent running...",
      icon: "running",
    }).run()

    // Simulate finishAgent updating it to "completed"
    const updated = testDb.update(schema.chatMessages)
      .set({ content: "Vision agent completed", icon: "completed" })
      .where(
        and(
          eq(schema.chatMessages.projectId, project.id),
          eq(schema.chatMessages.content, "Vision agent running..."),
          eq(schema.chatMessages.role, "system"),
        ),
      )
      .run()

    expect(updated.changes).toBe(1)

    const msg = testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, "sys-running"))
      .get()

    expect(msg!.content).toBe("Vision agent completed")
    expect(msg!.icon).toBe("completed")
  })

  it("running message transitions to failed when agent fails", () => {
    const project = seedProject(testDb)

    testDb.insert(schema.chatMessages).values({
      id: "sys-running",
      projectId: project.id,
      role: "system",
      content: "Vision agent running...",
      icon: "running",
    }).run()

    const updated = testDb.update(schema.chatMessages)
      .set({ content: "Vision agent failed", icon: "failed" })
      .where(
        and(
          eq(schema.chatMessages.projectId, project.id),
          eq(schema.chatMessages.content, "Vision agent running..."),
          eq(schema.chatMessages.role, "system"),
        ),
      )
      .run()

    expect(updated.changes).toBe(1)

    const msg = testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, "sys-running"))
      .get()

    expect(msg!.content).toBe("Vision agent failed")
    expect(msg!.icon).toBe("failed")
  })

  it("inserts new message if no running message found for agent", () => {
    const project = seedProject(testDb)

    // No running message exists — simulate finishAgent fallback insert
    const updated = testDb.update(schema.chatMessages)
      .set({ content: "Vision agent completed", icon: "completed" })
      .where(
        and(
          eq(schema.chatMessages.projectId, project.id),
          eq(schema.chatMessages.content, "Vision agent running..."),
          eq(schema.chatMessages.role, "system"),
        ),
      )
      .run()

    expect(updated.changes).toBe(0)

    // Fallback: insert new message
    testDb.insert(schema.chatMessages).values({
      id: "sys-completed",
      projectId: project.id,
      role: "system",
      content: "Vision agent completed",
      icon: "completed",
    }).run()

    const messages = testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.projectId, project.id))
      .all()

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe("Vision agent completed")
    expect(messages[0].icon).toBe("completed")
  })
})

describe("chat UX: pipeline progress messages persist", () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  it("pipeline progress events are persisted as system messages", () => {
    const project = seedProject(testDb)

    // Simulate what the plan route does for each SSE event
    const events = [
      { content: "Vision running...", icon: "running" },
      { content: "Vision completed", icon: "completed" },
      { content: "Milestones running...", icon: "running" },
      { content: "Milestones completed", icon: "completed" },
      { content: "Planning pipeline completed", icon: "completed" },
    ]

    for (const event of events) {
      testDb.insert(schema.chatMessages).values({
        id: crypto.randomUUID(),
        projectId: project.id,
        role: "system",
        content: event.content,
        icon: event.icon,
      }).run()
    }

    const systemMessages = testDb
      .select()
      .from(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.projectId, project.id),
          eq(schema.chatMessages.role, "system"),
        ),
      )
      .all()

    expect(systemMessages).toHaveLength(5)
    expect(systemMessages.map((m) => m.content)).toEqual([
      "Vision running...",
      "Vision completed",
      "Milestones running...",
      "Milestones completed",
      "Planning pipeline completed",
    ])
  })

  it("pipeline error is persisted as failed system message", () => {
    const project = seedProject(testDb)

    testDb.insert(schema.chatMessages).values({
      id: crypto.randomUUID(),
      projectId: project.id,
      role: "system",
      content: "Pipeline error: API rate limit exceeded",
      icon: "failed",
    }).run()

    const msg = testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.projectId, project.id))
      .get()

    expect(msg!.icon).toBe("failed")
    expect(msg!.content).toContain("rate limit")
  })
})

describe("chat UX: action confirmation", () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  it("actionExecuted flag is set on the message after confirmation", () => {
    const project = seedProject(testDb)

    testDb.insert(schema.chatMessages).values({
      id: "msg-with-action",
      projectId: project.id,
      role: "assistant",
      content: "I'll update the vision.\n\nACTION: runSkill vision",
      actionProposed: JSON.stringify([
        { action: "runSkill", entityId: "vision", description: "Run skill: vision" },
      ]),
      actionExecuted: 0,
    }).run()

    // Simulate confirm
    testDb.update(schema.chatMessages)
      .set({ actionExecuted: 1 })
      .where(eq(schema.chatMessages.id, "msg-with-action"))
      .run()

    const msg = testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, "msg-with-action"))
      .get()

    expect(msg!.actionExecuted).toBe(1)
  })

  it("cancelled action does not set actionExecuted", () => {
    const project = seedProject(testDb)

    testDb.insert(schema.chatMessages).values({
      id: "msg-cancelled",
      projectId: project.id,
      role: "assistant",
      content: "I'll skip this task.\n\nACTION: skipTask t-123",
      actionProposed: JSON.stringify([
        { action: "skipTask", entityId: "t-123", description: "Skip task: t-123" },
      ]),
      actionExecuted: 0,
    }).run()

    // User cancels — no DB update
    const msg = testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, "msg-cancelled"))
      .get()

    expect(msg!.actionExecuted).toBe(0)
  })
})
