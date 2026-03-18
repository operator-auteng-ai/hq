import { describe, it, expect, beforeEach, vi } from "vitest"
import { ProcessRegistry } from "./process-registry"
import { ConcurrencyLimitError } from "./types"
import type { ManagedProcess } from "./types"

function makeProcess(overrides: Partial<ManagedProcess> = {}): ManagedProcess {
  return {
    id: crypto.randomUUID(),
    projectId: "proj-1",
    type: "agent",
    status: "running",
    startedAt: new Date(),
    meta: {},
    ...overrides,
  }
}

describe("ProcessRegistry", () => {
  let registry: ProcessRegistry

  beforeEach(() => {
    registry = new ProcessRegistry({
      globalMax: 5,
      maxAgentsPerProject: 2,
      maxBackgroundPerProject: 2,
    })
  })

  it("registers and retrieves a process", () => {
    const proc = makeProcess()
    registry.register(proc)

    expect(registry.get(proc.id)).toBe(proc)
    expect(registry.count()).toBe(1)
  })

  it("unregisters a process", () => {
    const proc = makeProcess()
    registry.register(proc)
    registry.unregister(proc.id)

    expect(registry.get(proc.id)).toBeUndefined()
    expect(registry.count()).toBe(0)
  })

  it("getByProject returns processes for a project", () => {
    const p1 = makeProcess({ projectId: "proj-1" })
    const p2 = makeProcess({ projectId: "proj-2" })
    registry.register(p1)
    registry.register(p2)

    expect(registry.getByProject("proj-1")).toHaveLength(1)
    expect(registry.getByProject("proj-2")).toHaveLength(1)
    expect(registry.getByProject("proj-3")).toHaveLength(0)
  })

  it("getByType returns processes of a type", () => {
    const agent = makeProcess({ type: "agent" })
    const bg = makeProcess({ type: "background" })
    registry.register(agent)
    registry.register(bg)

    expect(registry.getByType("agent")).toHaveLength(1)
    expect(registry.getByType("background")).toHaveLength(1)
  })

  it("enforces global max limit", () => {
    for (let i = 0; i < 5; i++) {
      registry.register(makeProcess({ projectId: `proj-${i}` }))
    }

    expect(() =>
      registry.register(makeProcess({ projectId: "proj-5" })),
    ).toThrow(ConcurrencyLimitError)
  })

  it("enforces per-project agent limit", () => {
    registry.register(makeProcess({ projectId: "proj-1", type: "agent" }))
    registry.register(makeProcess({ projectId: "proj-1", type: "agent" }))

    expect(() =>
      registry.register(makeProcess({ projectId: "proj-1", type: "agent" })),
    ).toThrow(ConcurrencyLimitError)
  })

  it("enforces per-project background limit", () => {
    registry.register(makeProcess({ projectId: "proj-1", type: "background" }))
    registry.register(makeProcess({ projectId: "proj-1", type: "background" }))

    expect(() =>
      registry.register(
        makeProcess({ projectId: "proj-1", type: "background" }),
      ),
    ).toThrow(ConcurrencyLimitError)
  })

  it("emits process:started on register", () => {
    const handler = vi.fn()
    registry.on("process:started", handler)

    const proc = makeProcess()
    registry.register(proc)

    expect(handler).toHaveBeenCalledWith(proc)
  })

  it("emits process:stopped on unregister", () => {
    const handler = vi.fn()
    registry.on("process:stopped", handler)

    const proc = makeProcess()
    registry.register(proc)
    registry.unregister(proc.id)

    expect(handler).toHaveBeenCalledWith(proc)
  })

  it("emits process:failed on markFailed", () => {
    const handler = vi.fn()
    registry.on("process:failed", handler)

    const proc = makeProcess()
    registry.register(proc)
    registry.markFailed(proc.id)

    expect(handler).toHaveBeenCalledWith(proc)
    expect(proc.status).toBe("failed")
    expect(registry.get(proc.id)).toBeUndefined()
  })

  it("shutdownAll clears all processes", async () => {
    registry.register(makeProcess())
    registry.register(makeProcess())

    await registry.shutdownAll()

    expect(registry.count()).toBe(0)
    expect(registry.getAll()).toEqual([])
  })

  it("countByProject returns correct count", () => {
    registry.register(makeProcess({ projectId: "proj-1" }))
    registry.register(makeProcess({ projectId: "proj-1" }))
    registry.register(makeProcess({ projectId: "proj-2" }))

    expect(registry.countByProject("proj-1")).toBe(2)
    expect(registry.countByProject("proj-2")).toBe(1)
    expect(registry.countByProject("proj-3")).toBe(0)
  })
})
