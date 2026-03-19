import { test, expect } from "@playwright/test"

test.describe("Error paths: Generate Docs error handling", () => {
  test("shows error banner when generate endpoint returns an error", async ({ page }) => {
    // Create a project
    const res = await page.request.post("/api/projects", {
      data: {
        name: "Error Path Test",
        prompt: "Test project for error path E2E",
      },
    })
    const project = await res.json()

    await page.goto(`/projects/${project.id}`)

    // Mock the generate endpoint to return an error
    await page.route(`**/api/projects/${project.id}/generate`, (route) => {
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Test error: API key invalid" }),
      })
    })

    // Click Generate Docs
    await page.getByRole("button", { name: /generate docs/i }).click()

    // Should show error banner (not a silent failure)
    const errorBanner = page.getByTestId("gen-error")
    await expect(errorBanner).toBeVisible({ timeout: 5000 })
    await expect(errorBanner).toContainText("Test error")

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })

  test("shows error banner when SSE stream returns an error event", async ({ page }) => {
    const res = await page.request.post("/api/projects", {
      data: {
        name: "SSE Error Test",
        prompt: "Test SSE error handling",
      },
    })
    const project = await res.json()

    await page.goto(`/projects/${project.id}`)

    // Mock the generate endpoint to return an SSE error event
    await page.route(`**/api/projects/${project.id}/generate`, (route) => {
      const body = [
        "event: status",
        'data: {"step":"generating","message":"Starting..."}',
        "",
        "event: error",
        'data: {"message":"SSE test error: generation failed"}',
        "",
      ].join("\n")

      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body,
      })
    })

    await page.getByRole("button", { name: /generate docs/i }).click()

    // Should show the SSE error in the error banner
    const errorBanner = page.getByTestId("gen-error")
    await expect(errorBanner).toBeVisible({ timeout: 5000 })
    await expect(errorBanner).toContainText("SSE test error")

    await page.request.delete(`/api/projects/${project.id}`)
  })
})

test.describe("Error paths: Agent spawn error handling", () => {
  test("shows error when agent spawn returns error", async ({ page }) => {
    // Create a project
    const res = await page.request.post("/api/projects", {
      data: {
        name: "Agent Error Test",
        prompt: "Test agent spawn error handling",
      },
    })
    const project = await res.json()

    await page.goto(`/projects/${project.id}`)

    // Mock the phases endpoint to return a fake phase
    await page.route(`**/api/projects/${project.id}/phases`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            phaseNumber: 1,
            name: "Test Phase",
            description: "A test phase",
            exitCriteria: null,
            status: "pending",
          },
        ]),
      })
    })

    // Mock the project GET to include a workspace path (so hasDocs=true and Start button shows)
    await page.route(`**/api/projects/${project.id}`, (route, request) => {
      if (request.method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: project.id,
            name: "Agent Error Test",
            prompt: "Test agent spawn error handling",
            status: "planning",
            workspacePath: "/tmp/fake-workspace",
            deployUrl: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        })
      } else {
        route.continue()
      }
    })

    // Mock the agents spawn endpoint to return an error
    await page.route("**/api/agents", (route, request) => {
      if (request.method() === "POST") {
        route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Test error: agent spawn failed" }),
        })
      } else {
        route.continue()
      }
    })

    // Reload to pick up mocked routes
    await page.reload()

    // Switch to phases tab
    await page.getByRole("tab", { name: "Phases" }).click()

    // Click Start on the phase
    await page.getByRole("button", { name: /start/i }).first().click()

    // Should show error banner
    const errorBanner = page.getByTestId("gen-error")
    await expect(errorBanner).toBeVisible({ timeout: 5000 })
    await expect(errorBanner).toContainText("agent spawn failed")

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })
})
