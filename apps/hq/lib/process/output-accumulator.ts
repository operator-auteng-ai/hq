import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

const FLUSH_INTERVAL_MS = 5_000
const FLUSH_THRESHOLD = 50

export class OutputAccumulator {
  private buffer: unknown[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private agentId: string

  constructor(agentId: string) {
    this.agentId = agentId
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)
  }

  push(message: unknown): void {
    this.buffer.push(message)
    if (this.buffer.length >= FLUSH_THRESHOLD) {
      this.flush()
    }
  }

  /** Return all messages: flushed (from DB) + in-flight buffer */
  getBuffered(): unknown[] {
    try {
      const db = getDb()
      const existing = db
        .select({ output: schema.agentRuns.output })
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, this.agentId))
        .get()

      let all: unknown[] = []
      if (existing?.output) {
        try {
          all = JSON.parse(existing.output)
        } catch {
          all = []
        }
      }
      return [...all, ...this.buffer]
    } catch {
      return [...this.buffer]
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return

    const messages = [...this.buffer]
    this.buffer = []

    try {
      const db = getDb()
      const existing = db
        .select({ output: schema.agentRuns.output })
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.id, this.agentId))
        .get()

      let allMessages: unknown[] = []
      if (existing?.output) {
        try {
          allMessages = JSON.parse(existing.output)
        } catch {
          allMessages = []
        }
      }
      allMessages.push(...messages)

      db.update(schema.agentRuns)
        .set({ output: JSON.stringify(allMessages) })
        .where(eq(schema.agentRuns.id, this.agentId))
        .run()
    } catch (err) {
      // Re-queue on failure
      this.buffer.unshift(...messages)
      console.error(`Output flush failed for agent ${this.agentId}:`, err)
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.flush()
  }
}
