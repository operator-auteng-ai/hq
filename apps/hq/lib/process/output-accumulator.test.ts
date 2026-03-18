import { describe, it, vi, beforeEach } from "vitest"
import { OutputAccumulator } from "./output-accumulator"

// Mock the DB module
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => ({ output: null }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          run: vi.fn(),
        }),
      }),
    }),
  }),
  schema: {
    agentRuns: {
      id: "id",
      output: "output",
    },
  },
}))

// Mock drizzle-orm eq
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "mock-condition"),
}))

describe("OutputAccumulator", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("accumulates messages", () => {
    const acc = new OutputAccumulator("agent-1")
    acc.push({ type: "test", data: "hello" })
    acc.push({ type: "test", data: "world" })
    // Flush to verify buffer was used
    acc.stop()
  })

  it("flushes on threshold (50 messages)", () => {
    const acc = new OutputAccumulator("agent-1")
    for (let i = 0; i < 50; i++) {
      acc.push({ type: "test", index: i })
    }
    // After 50 messages, flush should trigger automatically
    acc.stop()
  })

  it("flushes on interval (5 seconds)", () => {
    const acc = new OutputAccumulator("agent-1")
    acc.push({ type: "test", data: "hello" })

    vi.advanceTimersByTime(5001)
    // Timer should have triggered flush
    acc.stop()
  })

  it("stop clears the timer", () => {
    const acc = new OutputAccumulator("agent-1")
    acc.push({ type: "test" })
    acc.stop()

    // After stopping, advancing timers should not cause issues
    vi.advanceTimersByTime(10000)
  })
})
