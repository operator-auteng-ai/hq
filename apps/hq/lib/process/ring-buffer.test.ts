import { describe, it, expect } from "vitest"
import { RingBuffer } from "./ring-buffer"

describe("RingBuffer", () => {
  it("stores and retrieves entries", () => {
    const buf = new RingBuffer(10)
    buf.pushLine("stdout", "hello")
    buf.pushLine("stderr", "world")

    const all = buf.getAll()
    expect(all).toHaveLength(2)
    expect(all[0].stream).toBe("stdout")
    expect(all[0].line).toBe("hello")
    expect(all[1].stream).toBe("stderr")
    expect(all[1].line).toBe("world")
  })

  it("returns correct length", () => {
    const buf = new RingBuffer(10)
    expect(buf.length).toBe(0)
    buf.pushLine("stdout", "a")
    buf.pushLine("stdout", "b")
    expect(buf.length).toBe(2)
  })

  it("wraps around at capacity", () => {
    const buf = new RingBuffer(3)
    buf.pushLine("stdout", "a")
    buf.pushLine("stdout", "b")
    buf.pushLine("stdout", "c")
    buf.pushLine("stdout", "d")

    const all = buf.getAll()
    expect(all).toHaveLength(3)
    expect(all.map((e) => e.line)).toEqual(["b", "c", "d"])
  })

  it("getLast returns last N entries", () => {
    const buf = new RingBuffer(10)
    buf.pushLine("stdout", "a")
    buf.pushLine("stdout", "b")
    buf.pushLine("stdout", "c")
    buf.pushLine("stdout", "d")

    const last2 = buf.getLast(2)
    expect(last2.map((e) => e.line)).toEqual(["c", "d"])
  })

  it("getLast handles requesting more than available", () => {
    const buf = new RingBuffer(10)
    buf.pushLine("stdout", "a")

    const all = buf.getLast(5)
    expect(all).toHaveLength(1)
    expect(all[0].line).toBe("a")
  })

  it("clear resets the buffer", () => {
    const buf = new RingBuffer(10)
    buf.pushLine("stdout", "a")
    buf.pushLine("stdout", "b")
    buf.clear()

    expect(buf.length).toBe(0)
    expect(buf.getAll()).toEqual([])
  })

  it("handles high volume with wrapping", () => {
    const buf = new RingBuffer(500)
    for (let i = 0; i < 1000; i++) {
      buf.pushLine("stdout", `line-${i}`)
    }
    expect(buf.length).toBe(500)
    const all = buf.getAll()
    expect(all[0].line).toBe("line-500")
    expect(all[499].line).toBe("line-999")
  })

  it("timestamps are monotonically increasing", () => {
    const buf = new RingBuffer(10)
    buf.pushLine("stdout", "a")
    buf.pushLine("stdout", "b")

    const all = buf.getAll()
    expect(all[1].timestamp.getTime()).toBeGreaterThanOrEqual(
      all[0].timestamp.getTime(),
    )
  })
})
