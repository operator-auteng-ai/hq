import { describe, it, expect } from "vitest"
import { createProjectSchema, updateProjectSchema } from "./project"

describe("createProjectSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = createProjectSchema.safeParse({
      name: "My SaaS Product",
      prompt: "Build a SaaS product that helps teams manage their projects efficiently with AI.",
      model: "sonnet",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("My SaaS Product")
      expect(result.data.model).toBe("sonnet")
    }
  })

  it("defaults model to sonnet when omitted", () => {
    const result = createProjectSchema.safeParse({
      name: "Test Project",
      prompt: "A prompt that is at least twenty characters long for validation.",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.model).toBe("sonnet")
    }
  })

  it("rejects empty name", () => {
    const result = createProjectSchema.safeParse({
      name: "",
      prompt: "A prompt that is at least twenty characters long.",
    })
    expect(result.success).toBe(false)
  })

  it("rejects prompt shorter than 20 characters", () => {
    const result = createProjectSchema.safeParse({
      name: "Test",
      prompt: "Too short",
    })
    expect(result.success).toBe(false)
  })

  it("rejects prompt exceeding 10,000 characters", () => {
    const result = createProjectSchema.safeParse({
      name: "Test",
      prompt: "x".repeat(10001),
    })
    expect(result.success).toBe(false)
  })

  it("accepts prompt at exactly 20 characters", () => {
    const result = createProjectSchema.safeParse({
      name: "Test",
      prompt: "x".repeat(20),
    })
    expect(result.success).toBe(true)
  })

  it("rejects name exceeding 100 characters", () => {
    const result = createProjectSchema.safeParse({
      name: "x".repeat(101),
      prompt: "A prompt that is at least twenty characters long.",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid model", () => {
    const result = createProjectSchema.safeParse({
      name: "Test",
      prompt: "A prompt that is at least twenty characters long.",
      model: "gpt-4",
    })
    expect(result.success).toBe(false)
  })

  it("accepts all valid model options", () => {
    for (const model of ["sonnet", "opus", "haiku"]) {
      const result = createProjectSchema.safeParse({
        name: "Test",
        prompt: "A prompt that is at least twenty characters long.",
        model,
      })
      expect(result.success).toBe(true)
    }
  })

  it("rejects missing name", () => {
    const result = createProjectSchema.safeParse({
      prompt: "A prompt that is at least twenty characters long.",
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing prompt", () => {
    const result = createProjectSchema.safeParse({
      name: "Test",
    })
    expect(result.success).toBe(false)
  })
})

describe("updateProjectSchema", () => {
  it("accepts partial updates", () => {
    const result = updateProjectSchema.safeParse({
      name: "Updated Name",
    })
    expect(result.success).toBe(true)
  })

  it("accepts valid status values", () => {
    const validStatuses = ["draft", "planning", "building", "deployed", "paused", "archived"]
    for (const status of validStatuses) {
      const result = updateProjectSchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })

  it("rejects invalid status", () => {
    const result = updateProjectSchema.safeParse({
      status: "invalid_status",
    })
    expect(result.success).toBe(false)
  })

  it("accepts valid deploy URL", () => {
    const result = updateProjectSchema.safeParse({
      deployUrl: "https://my-app.vercel.app",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid deploy URL", () => {
    const result = updateProjectSchema.safeParse({
      deployUrl: "not-a-url",
    })
    expect(result.success).toBe(false)
  })

  it("accepts empty object (no updates)", () => {
    const result = updateProjectSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("accepts workspace path", () => {
    const result = updateProjectSchema.safeParse({
      workspacePath: "/Users/test/auteng-projects/my-project",
    })
    expect(result.success).toBe(true)
  })
})
