import { describe, it, expect, vi, beforeEach } from "vitest"

const mockCreate = vi.fn()

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mockCreate }
    constructor() {}
  }
  return { default: MockAnthropic }
})

// Import after mock is set up
const { generateProjectDocs } = await import("./doc-generator")

describe("generateProjectDocs", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-123")
    mockCreate.mockReset()
  })

  it("throws when no API key is available", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    await expect(
      generateProjectDocs("Test", "A test prompt for doc generation"),
    ).rejects.toThrow("No API key available")
  })

  it("generates all 5 docs in the correct order", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "# Generated Doc" }],
    })

    const docs = await generateProjectDocs(
      "My Project",
      "Build a task management app with AI features",
      "sonnet",
    )

    expect(docs.vision).toBe("# Generated Doc")
    expect(docs.arch).toBe("# Generated Doc")
    expect(docs.plan).toBe("# Generated Doc")
    expect(docs.taxonomy).toBe("# Generated Doc")
    expect(docs.codingStandards).toBe("# Generated Doc")

    // Should make 5 API calls total
    expect(mockCreate).toHaveBeenCalledTimes(5)
  })

  it("chains context from VISION into ARCH call", async () => {
    let callIndex = 0
    mockCreate.mockImplementation(() => {
      callIndex++
      return Promise.resolve({
        content: [{ type: "text", text: `# Doc ${callIndex}` }],
      })
    })

    await generateProjectDocs("Test", "Build something interesting and cool enough")

    // Second call (ARCH) should include VISION context
    const archCall = mockCreate.mock.calls[1]
    const archMessage = archCall[0].messages[0].content as string
    expect(archMessage).toContain("Previously generated VISION.md")
    expect(archMessage).toContain("# Doc 1")
  })

  it("chains context from VISION and ARCH into PLAN call", async () => {
    let callIndex = 0
    mockCreate.mockImplementation(() => {
      callIndex++
      return Promise.resolve({
        content: [{ type: "text", text: `# Doc ${callIndex}` }],
      })
    })

    await generateProjectDocs("Test", "Build something interesting and cool enough")

    // Third call (PLAN) should include both VISION and ARCH
    const planCall = mockCreate.mock.calls[2]
    const planMessage = planCall[0].messages[0].content as string
    expect(planMessage).toContain("Previously generated VISION.md")
    expect(planMessage).toContain("Previously generated ARCH.md")
  })

  it("uses the correct model ID for each model key", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "# Doc" }],
    })

    await generateProjectDocs("Test", "Build something interesting and cool enough", "opus")

    const firstCall = mockCreate.mock.calls[0]
    expect(firstCall[0].model).toBe("claude-opus-4-20250514")
  })

  it("throws when API returns no text content", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "1", name: "test", input: {} }],
    })

    await expect(
      generateProjectDocs("Test", "Build something interesting and cool enough"),
    ).rejects.toThrow("No text response")
  })

  it("includes project name in API calls", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "# Doc" }],
    })

    await generateProjectDocs("Cool SaaS", "Build something interesting and cool enough")

    const firstCall = mockCreate.mock.calls[0]
    const message = firstCall[0].messages[0].content as string
    expect(message).toContain("Cool SaaS")
  })
})
