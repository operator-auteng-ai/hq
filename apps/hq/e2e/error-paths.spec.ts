import { test, expect } from "@playwright/test"

test.describe("Error paths: Project detail page", () => {
  test("project detail loads and shows milestones tab", async ({ page }) => {
    const uniqueName = `E2E Test ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: {
        name: uniqueName,
        prompt: "Test project for error path E2E testing",
        isTest: true,
      },
    })
    const project = await res.json()

    await page.goto(`/projects/${project.id}`)

    // Verify project page loads (matches in sidebar and header — use first)
    await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 5000 })

    // Verify pipeline nav exists (cockpit layout)
    await expect(page.getByRole("button", { name: "Vision" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Tasks" })).toBeVisible()

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })
})

test.describe("Error paths: Chat API error handling", () => {
  test("chat API returns 400 for empty message", async ({ page }) => {
    const uniqueName = `Chat E2E ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: {
        name: uniqueName,
        prompt: "Test chat error handling in E2E",
        isTest: true,
      },
    })
    const project = await res.json()

    // Try to chat with empty message — should get validation error
    const chatRes = await page.request.post(
      `/api/projects/${project.id}/chat`,
      {
        data: { message: "" },
      },
    )

    expect(chatRes.status()).toBe(400)

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })
})
