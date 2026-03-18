import { describe, it, expect } from "vitest"
import { createTestDb, seedProject } from "@/lib/test-helpers"
import * as schema from "@/lib/db/schema"
import { eq } from "drizzle-orm"

describe("Phase 2 Schema", () => {
  describe("agent_runs table", () => {
    it("inserts and retrieves an agent run", () => {
      const db = createTestDb()
      const project = seedProject(db)

      db.insert(schema.agentRuns)
        .values({
          id: "run-1",
          projectId: project.id,
          agentType: "claude_code",
          prompt: "Implement feature X",
          status: "queued",
          model: "sonnet",
          maxTurns: 50,
          budgetUsd: 5.0,
          createdAt: new Date().toISOString(),
        })
        .run()

      const run = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, "run-1"))
        .get()

      expect(run).toBeDefined()
      expect(run!.projectId).toBe(project.id)
      expect(run!.agentType).toBe("claude_code")
      expect(run!.prompt).toBe("Implement feature X")
      expect(run!.model).toBe("sonnet")
    })

    it("allows nullable phaseId", () => {
      const db = createTestDb()
      const project = seedProject(db)

      db.insert(schema.agentRuns)
        .values({
          id: "run-2",
          projectId: project.id,
          phaseId: null,
          agentType: "claude_code",
          prompt: "Ad-hoc task",
          status: "queued",
          createdAt: new Date().toISOString(),
        })
        .run()

      const run = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, "run-2"))
        .get()

      expect(run!.phaseId).toBeNull()
    })

    it("stores cost and turn tracking fields", () => {
      const db = createTestDb()
      const project = seedProject(db)

      db.insert(schema.agentRuns)
        .values({
          id: "run-3",
          projectId: project.id,
          agentType: "claude_code",
          prompt: "Build something",
          status: "completed",
          sessionId: "sess-abc",
          costUsd: 0.125,
          turnCount: 12,
          maxTurns: 50,
          budgetUsd: 5.0,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        })
        .run()

      const run = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, "run-3"))
        .get()

      expect(run!.sessionId).toBe("sess-abc")
      expect(run!.costUsd).toBe(0.125)
      expect(run!.turnCount).toBe(12)
    })

    it("filters by projectId", () => {
      const db = createTestDb()
      const p1 = seedProject(db, { id: "p1", name: "Project 1" })
      const p2 = seedProject(db, { id: "p2", name: "Project 2" })

      db.insert(schema.agentRuns)
        .values({
          id: "run-a",
          projectId: p1.id,
          agentType: "claude_code",
          prompt: "A",
          createdAt: new Date().toISOString(),
        })
        .run()
      db.insert(schema.agentRuns)
        .values({
          id: "run-b",
          projectId: p2.id,
          agentType: "claude_code",
          prompt: "B",
          createdAt: new Date().toISOString(),
        })
        .run()

      const p1Runs = db
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.projectId, p1.id))
        .all()

      expect(p1Runs).toHaveLength(1)
      expect(p1Runs[0].id).toBe("run-a")
    })
  })

  describe("background_processes table", () => {
    it("inserts and retrieves a background process", () => {
      const db = createTestDb()
      const project = seedProject(db)

      db.insert(schema.backgroundProcesses)
        .values({
          id: "bp-1",
          projectId: project.id,
          processType: "dev_server",
          command: "npm",
          args: JSON.stringify(["run", "dev"]),
          status: "running",
          port: 3000,
          url: "http://localhost:3000",
          startedAt: new Date().toISOString(),
        })
        .run()

      const bp = db
        .select()
        .from(schema.backgroundProcesses)
        .where(eq(schema.backgroundProcesses.id, "bp-1"))
        .get()

      expect(bp).toBeDefined()
      expect(bp!.processType).toBe("dev_server")
      expect(bp!.port).toBe(3000)
      expect(JSON.parse(bp!.args!)).toEqual(["run", "dev"])
    })
  })

  describe("process_configs table", () => {
    it("inserts project-specific config", () => {
      const db = createTestDb()
      const project = seedProject(db)

      db.insert(schema.processConfigs)
        .values({
          id: "cfg-1",
          projectId: project.id,
          maxAgents: 3,
          maxBackground: 2,
          defaultModel: "opus",
          defaultMaxTurns: 100,
          defaultBudgetUsd: 10.0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run()

      const cfg = db
        .select()
        .from(schema.processConfigs)
        .where(eq(schema.processConfigs.id, "cfg-1"))
        .get()

      expect(cfg!.maxAgents).toBe(3)
      expect(cfg!.defaultModel).toBe("opus")
    })

    it("allows null projectId for global defaults", () => {
      const db = createTestDb()

      db.insert(schema.processConfigs)
        .values({
          id: "cfg-global",
          projectId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run()

      const cfg = db
        .select()
        .from(schema.processConfigs)
        .where(eq(schema.processConfigs.id, "cfg-global"))
        .get()

      expect(cfg!.projectId).toBeNull()
      expect(cfg!.maxAgents).toBe(5) // default
    })
  })

  describe("deploy_events table", () => {
    it("supports version_label column", () => {
      const db = createTestDb()
      const project = seedProject(db)

      db.insert(schema.deployEvents)
        .values({
          id: "dep-1",
          projectId: project.id,
          platform: "vercel",
          environment: "production",
          versionLabel: "v0.1.0",
          status: "live",
          deployedAt: new Date().toISOString(),
        })
        .run()

      const dep = db
        .select()
        .from(schema.deployEvents)
        .where(eq(schema.deployEvents.id, "dep-1"))
        .get()

      expect(dep!.versionLabel).toBe("v0.1.0")
    })
  })
})
