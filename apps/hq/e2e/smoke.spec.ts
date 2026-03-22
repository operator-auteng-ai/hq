import { test, expect } from "@playwright/test"

test.describe("Smoke: pages render and hydrate", () => {
  test("dashboard loads without JS errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto("/")
    await expect(page.locator("body")).not.toBeEmpty()
    await expect(page.getByRole("link", { name: "Projects", exact: true }).first()).toBeVisible()

    expect(errors).toEqual([])
  })

  test("settings page renders", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto("/settings")
    await expect(page.getByText("API Keys")).toBeVisible()
    await expect(page.getByLabel("Anthropic API Key")).toBeVisible()
    await expect(page.getByRole("button", { name: /save key/i })).toBeVisible()

    expect(errors).toEqual([])
  })

  test("projects page renders", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto("/projects")
    await expect(page.locator("body")).not.toBeEmpty()

    expect(errors).toEqual([])
  })

  test("agents page renders", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto("/agents")
    await expect(page.locator("body")).not.toBeEmpty()

    expect(errors).toEqual([])
  })
})

test.describe("Smoke: Settings API key flow", () => {
  test("save API key and verify it persists across reload", async ({ page }) => {
    // Clean state
    await page.request.put("/api/settings", {
      data: { anthropicApiKey: "" },
    })

    await page.goto("/settings")

    // Enter and save a test key
    await page.getByLabel("Anthropic API Key").fill("sk-ant-test-smoke-key-1234")
    await page.getByRole("button", { name: /save key/i }).click()

    // Should show "Configured" badge with hint
    await expect(page.getByText("Configured")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("...1234")).toBeVisible()

    // Reload and verify persistence
    await page.reload()
    await expect(page.getByText("Configured")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("...1234")).toBeVisible()

    // Clean up
    await page.request.put("/api/settings", {
      data: { anthropicApiKey: "" },
    })
  })

  test("save replaces existing key", async ({ page }) => {
    // Set initial key
    await page.request.put("/api/settings", {
      data: { anthropicApiKey: "sk-first-key-aaaa" },
    })

    await page.goto("/settings")
    await expect(page.getByText("...aaaa")).toBeVisible({ timeout: 5000 })

    // Replace with new key
    await page.getByLabel("Anthropic API Key").fill("sk-second-key-bbbb")
    await page.getByRole("button", { name: /save key/i }).click()

    await expect(page.getByText("...bbbb")).toBeVisible({ timeout: 5000 })

    // Clean up
    await page.request.put("/api/settings", {
      data: { anthropicApiKey: "" },
    })
  })

  test("remove key via API clears DB entry", async ({ page }) => {
    // Set then remove
    await page.request.put("/api/settings", {
      data: { anthropicApiKey: "sk-to-delete-zzzz" },
    })

    // Verify it's set
    const before = await page.request.get("/api/settings")
    const beforeData = await before.json()
    expect(beforeData.anthropicApiKey.configured).toBe(true)

    // Remove
    await page.request.put("/api/settings", {
      data: { anthropicApiKey: "" },
    })

    // Verify DB key is gone (env fallback may still show configured)
    const after = await page.request.get("/api/settings")
    const afterData = await after.json()
    // The hint should NOT be "...zzzz" anymore
    expect(afterData.anthropicApiKey.hint).not.toBe("...zzzz")
  })
})

test.describe("Smoke: Project detail page", () => {
  test("project detail shows milestones tab and chat tab", async ({ page }) => {
    const uniqueName = `Smoke Detail ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: {
        name: uniqueName,
        prompt: "A test project to verify project detail page renders correctly",
      },
    })
    const project = await res.json()

    await page.goto(`/projects/${project.id}`)

    // Should show project name
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 })

    // Should have Milestones and Chat tabs
    await expect(page.getByRole("tab", { name: "Milestones" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Chat" })).toBeVisible()

    // Click milestones tab — should show empty state
    await page.getByRole("tab", { name: "Milestones" }).click()
    await expect(page.getByText(/no milestones/i)).toBeVisible({ timeout: 3000 })

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })
})

test.describe("Smoke: navigation hydration", () => {
  test("sidebar links work (client-side navigation)", async ({ page }) => {
    await page.goto("/")

    await page.getByRole("link", { name: "Settings", exact: true }).click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByText("API Keys")).toBeVisible()

    await page.getByRole("link", { name: "Projects", exact: true }).first().click()
    await expect(page).toHaveURL(/\/projects/)

    await page.getByRole("link", { name: "Dashboard", exact: true }).click()
    await expect(page).toHaveURL("/")
  })
})
