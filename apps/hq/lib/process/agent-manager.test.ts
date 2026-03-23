import { describe, it, expect, vi, beforeEach } from "vitest"
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

vi.mock("./process-registry", () => ({
  getProcessRegistry: () => ({
    register: vi.fn(),
    unregister: vi.fn(),
    markFailed: vi.fn(),
  }),
}))

vi.mock("./hq-mcp-server", () => ({
  createHqMcpServer: vi.fn().mockReturnValue({}),
}))

// Mock the SDK query function
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn().mockReturnValue(
    (async function* () {
      yield { type: "assistant", content: "done" }
    })(),
  ),
}))

describe("AgentManager", () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.clearAllMocks()
  })

  describe("onComplete callback", () => {
    it("invokes registered callback when agent finishes", async () => {
      const project = seedProject(testDb, { workspacePath: "/tmp/test" })
      const { AgentManager } = await import("./agent-manager")
      const manager = new AgentManager()

      const agentId = crypto.randomUUID()
      testDb
        .insert(schema.agentRuns)
        .values({
          id: agentId,
          projectId: project.id,
          agentType: "claude_code",
          prompt: "test",
          status: "queued",
        })
        .run()

      const callback = vi.fn()
      manager.onComplete(agentId, callback)

      // Spawn the agent — the mocked SDK will complete immediately
      await manager.spawn(agentId, project.id, "test prompt", {
        apiKey: "sk-test",
      })

      // Wait for the async stream to be consumed
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalledWith(agentId, "completed")
    })
  })

  describe("waitForAgent", () => {
    it("resolves immediately for already-finished agent", async () => {
      const project = seedProject(testDb)
      const { AgentManager } = await import("./agent-manager")
      const manager = new AgentManager()

      const agentId = crypto.randomUUID()
      testDb
        .insert(schema.agentRuns)
        .values({
          id: agentId,
          projectId: project.id,
          agentType: "claude_code",
          prompt: "test",
          status: "completed",
          completedAt: new Date().toISOString(),
        })
        .run()

      const status = await manager.waitForAgent(agentId)
      expect(status).toBe("completed")
    })

    it("resolves for failed agent", async () => {
      const project = seedProject(testDb)
      const { AgentManager } = await import("./agent-manager")
      const manager = new AgentManager()

      const agentId = crypto.randomUUID()
      testDb
        .insert(schema.agentRuns)
        .values({
          id: agentId,
          projectId: project.id,
          agentType: "claude_code",
          prompt: "test",
          status: "failed",
          completedAt: new Date().toISOString(),
        })
        .run()

      const status = await manager.waitForAgent(agentId)
      expect(status).toBe("failed")
    })
  })

  describe("spawn error handling", () => {
    it("creates agent_runs record with project link", async () => {
      const project = seedProject(testDb, { workspacePath: "/tmp/test" })
      const { AgentManager } = await import("./agent-manager")
      const manager = new AgentManager()

      const agentId = crypto.randomUUID()
      testDb
        .insert(schema.agentRuns)
        .values({
          id: agentId,
          projectId: project.id,
          agentType: "claude_code",
          prompt: "test",
          status: "queued",
        })
        .run()

      await manager.spawn(agentId, project.id, "test prompt", {
        apiKey: "sk-test",
      })

      const run = testDb
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, agentId))
        .get()

      expect(run).toBeDefined()
      expect(run!.projectId).toBe(project.id)
    })
  })

  describe("streamOutput", () => {
    it("returns a ReadableStream", async () => {
      const project = seedProject(testDb)
      const { AgentManager } = await import("./agent-manager")
      const manager = new AgentManager()

      const agentId = crypto.randomUUID()
      testDb
        .insert(schema.agentRuns)
        .values({
          id: agentId,
          projectId: project.id,
          agentType: "claude_code",
          prompt: "test",
          status: "completed",
          output: JSON.stringify([{ type: "assistant", content: "hello" }]),
        })
        .run()

      const stream = manager.streamOutput(agentId)
      expect(stream).toBeInstanceOf(ReadableStream)
    })
  })
})
