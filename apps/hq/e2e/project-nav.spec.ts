import { test, expect } from "@playwright/test"

test.describe("Project-scoped navigation", () => {
  let projectId: string
  const projectName = `NavTest ${Date.now()}`

  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/projects", {
      data: {
        name: projectName,
        prompt: "A test project to verify project-scoped navigation works correctly",
        isTest: true,
      },
    })
    const data = await res.json()
    projectId = data.id
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/projects/${projectId}`)
  })

  test("global sidebar shows standard nav items", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Projects", exact: true }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: "Agents", exact: true }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: "Deploys", exact: true }).first()).toBeVisible()
  })

  test("entering a project switches sidebar to project-scoped nav", async ({ page }) => {
    await page.goto(`/projects/${projectId}`)

    // Wait for project-scoped sidebar to load
    await expect(page.getByText("All Projects")).toBeVisible({ timeout: 5000 })

    // Project name should be visible in sidebar header
    await expect(page.locator("[data-sidebar='sidebar']").getByText(projectName)).toBeVisible({ timeout: 5000 })

    // Project-scoped nav items should be present
    await expect(page.getByRole("link", { name: "Cockpit", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Agents", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Deploys", exact: true })).toBeVisible()

    // Global-only nav items should NOT be present
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).not.toBeVisible()
  })

  test("project agents page renders without errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto(`/projects/${projectId}/agents`)

    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible({ timeout: 5000 })
    // Should still show project-scoped sidebar
    await expect(page.getByText("All Projects")).toBeVisible()
    await expect(page.locator("[data-sidebar='sidebar']").getByText(projectName)).toBeVisible({ timeout: 5000 })

    expect(errors).toEqual([])
  })

  test("project deploys page renders without errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto(`/projects/${projectId}/deploys`)

    await expect(page.getByRole("heading", { name: "Deploys" })).toBeVisible({ timeout: 5000 })
    // Should still show project-scoped sidebar
    await expect(page.getByText("All Projects")).toBeVisible()
    await expect(page.locator("[data-sidebar='sidebar']").getByText(projectName)).toBeVisible({ timeout: 5000 })

    expect(errors).toEqual([])
  })

  test("back link returns to global projects list", async ({ page }) => {
    await page.goto(`/projects/${projectId}`)
    await expect(page.getByText("All Projects")).toBeVisible({ timeout: 5000 })

    await page.getByText("All Projects").click()

    await expect(page).toHaveURL(/\/projects$/)
    // Global nav should be restored
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible()
  })

  test("sidebar nav links within project scope work", async ({ page }) => {
    await page.goto(`/projects/${projectId}`)
    await expect(page.getByRole("link", { name: "Agents", exact: true })).toBeVisible({ timeout: 5000 })

    // Navigate to project agents
    await page.getByRole("link", { name: "Agents", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/agents`))

    // Navigate to project deploys
    await page.getByRole("link", { name: "Deploys", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/deploys`))

    // Navigate back to cockpit
    await page.getByRole("link", { name: "Cockpit", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
  })

  test("global agents page still renders", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto("/agents")
    await expect(page.locator("body")).not.toBeEmpty()
    // Should show global sidebar
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible()

    expect(errors).toEqual([])
  })

  test("settings accessible from project-scoped nav", async ({ page }) => {
    await page.goto(`/projects/${projectId}`)
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible({ timeout: 5000 })

    await page.getByRole("link", { name: "Settings", exact: true }).click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByText("API Keys")).toBeVisible()
  })
})
