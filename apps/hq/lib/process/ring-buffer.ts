import type { RingBufferEntry } from "./types"

export class RingBuffer {
  private buffer: RingBufferEntry[]
  private head = 0
  private size = 0
  private readonly capacity: number

  constructor(capacity = 500) {
    this.capacity = capacity
    this.buffer = new Array(capacity)
  }

  push(entry: RingBufferEntry): void {
    this.buffer[this.head] = entry
    this.head = (this.head + 1) % this.capacity
    if (this.size < this.capacity) {
      this.size++
    }
  }

  pushLine(stream: "stdout" | "stderr", line: string): void {
    this.push({ timestamp: new Date(), stream, line })
  }

  getAll(): RingBufferEntry[] {
    if (this.size === 0) return []
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size)
    }
    // Buffer is full — head points to oldest entry
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ]
  }

  getLast(n: number): RingBufferEntry[] {
    const all = this.getAll()
    return all.slice(Math.max(0, all.length - n))
  }

  clear(): void {
    this.buffer = new Array(this.capacity)
    this.head = 0
    this.size = 0
  }

  get length(): number {
    return this.size
  }
}
