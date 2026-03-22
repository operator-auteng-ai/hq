import { describe, it, expect } from "vitest"
import { extractActions } from "./action-extractor"

describe("extractActions", () => {
  it("extracts a single action", () => {
    const message = `The task failed because of a missing module.

ACTION: retryTask t-123`

    const actions = extractActions(message)
    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe("retryTask")
    expect(actions[0].entityId).toBe("t-123")
    expect(actions[0].description).toBe("Retry task: t-123")
  })

  it("extracts multiple actions", () => {
    const message = `I'll skip the failing task and start the next one.

ACTION: skipTask t-456
ACTION: startTask t-789`

    const actions = extractActions(message)
    expect(actions).toHaveLength(2)
    expect(actions[0].action).toBe("skipTask")
    expect(actions[0].entityId).toBe("t-456")
    expect(actions[1].action).toBe("startTask")
    expect(actions[1].entityId).toBe("t-789")
  })

  it("returns empty array for messages without actions", () => {
    const message = "The project is progressing well. No issues found."
    expect(extractActions(message)).toEqual([])
  })

  it("ignores unrecognized action names", () => {
    const message = "ACTION: deleteProject p-123"
    expect(extractActions(message)).toEqual([])
  })

  it("ignores malformed action lines", () => {
    const message = "ACTION: retryTask"
    expect(extractActions(message)).toEqual([])
  })

  it("handles runSkill with milestone name", () => {
    const message = "ACTION: runSkill architecture payments"
    const actions = extractActions(message)
    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe("runSkill")
    expect(actions[0].entityId).toBe("architecture payments")
  })

  it("handles all allowed action types", () => {
    const message = `ACTION: startTask t1
ACTION: retryTask t2
ACTION: skipTask t3
ACTION: approvePhase p1
ACTION: rejectPhase p2
ACTION: approveMilestone m1
ACTION: startPhase p3
ACTION: runSkill vision`

    const actions = extractActions(message)
    expect(actions).toHaveLength(8)
  })
})
