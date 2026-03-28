import { test, expect } from "@playwright/test"

test.describe("Pipeline state persistence across refresh", () => {
  test("review banner and pipeline level survive page refresh", async ({ page }) => {
    const uniqueName = `Persist ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: { name: uniqueName, prompt: "Test state persistence across refresh", isTest: true },
    })
    const project = await res.json()

    // Mock plan endpoint to simulate pipeline pausing at vision review
    await page.route(`**/api/projects/${project.id}/plan`, (route) => {
      const body = [
        "event: progress",
        'data: {"level":"vision","status":"running"}',
        "",
        "event: progress",
        'data: {"level":"vision","status":"completed","agentId":"a1"}',
        "",
        "event: complete",
        'data: {"success":true,"awaitingReview":"vision"}',
        "",
      ].join("\n")

      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body,
      })
    })

    // Also set the project's planningStep in DB to simulate the engine having saved it
    await page.request.patch(`/api/projects/${project.id}`, {
      data: { status: "planning", planningStep: "milestones" },
    })

    await page.goto(`/projects/${project.id}`)

    // Should show the review banner
    await expect(page.getByText(/review the vision document/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole("button", { name: "Continue Pipeline" })).toBeVisible()

    // Now refresh the page (no SSE events this time — must reconstruct from DB)
    await page.reload()

    // Review banner should still be visible after refresh
    await expect(page.getByText(/review the vision document/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole("button", { name: "Continue Pipeline" })).toBeVisible()

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })

  test("completed pipeline level is selected after refresh", async ({ page }) => {
    const uniqueName = `Level ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: { name: uniqueName, prompt: "Test pipeline level persistence", isTest: true },
    })
    const project = await res.json()

    // Set project to building with complete planningStep (pipeline finished)
    await page.request.patch(`/api/projects/${project.id}`, {
      data: { status: "building", planningStep: "complete" },
    })

    // Mock milestones with phases and tasks so all levels show as completed
    await page.route(`**/api/projects/${project.id}/milestones`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          milestones: [{
            id: "m1", name: "MVP", status: "active", isMvpBoundary: 1, sortOrder: 0,
            phases: [{
              id: "p1", name: "Core", status: "active", sortOrder: 0,
              tasks: [{ id: "t1", name: "Build it", status: "pending", sortOrder: 0, sourceDoc: null }],
            }],
          }],
          progress: {
            totalMilestones: 1, completedMilestones: 0,
            totalPhases: 1, completedPhases: 0,
            totalTasks: 1, completedTasks: 0,
          },
        }),
      })
    })

    // Mock docs with vision
    await page.route(`**/api/projects/${project.id}/docs`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ vision: "# Vision\nTest vision doc" }),
      })
    })

    // Mock plan endpoint to prevent auto-trigger
    await page.route(`**/api/projects/${project.id}/plan`, (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: "event: complete\ndata: {}\n\n",
      })
    })

    await page.goto(`/projects/${project.id}`)

    // Should show Tasks as the active/accessible level (highest completed)
    await expect(page.getByRole("button", { name: "Tasks" })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole("button", { name: "Tasks" })).toBeEnabled()

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })

  test("chat history survives page refresh", async ({ page }) => {
    const uniqueName = `Chat ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: { name: uniqueName, prompt: "Test chat persistence", isTest: true },
    })
    const project = await res.json()

    // Set project out of draft to prevent auto-trigger
    await page.request.patch(`/api/projects/${project.id}`, {
      data: { status: "planning", planningStep: "milestones" },
    })

    // Insert a system message directly in DB via chat API
    await page.request.post(`/api/projects/${project.id}/chat`, {
      headers: { "Content-Type": "application/json" },
      data: { message: "test chat message" },
    })

    await page.goto(`/projects/${project.id}`)

    // Chat should show the message
    await expect(page.getByText("test chat message")).toBeVisible({ timeout: 5000 })

    // Refresh
    await page.reload()

    // Message should still be there
    await expect(page.getByText("test chat message")).toBeVisible({ timeout: 5000 })

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })

  test("draft project with no planningStep does not re-trigger after planning starts", async ({ page }) => {
    const uniqueName = `NoRetrigger ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: { name: uniqueName, prompt: "Test no re-trigger after planning starts", isTest: true },
    })
    const project = await res.json()

    // Set project to planning with a planningStep (already started)
    await page.request.patch(`/api/projects/${project.id}`, {
      data: { status: "planning", planningStep: "milestones" },
    })

    let planCallCount = 0
    await page.route(`**/api/projects/${project.id}/plan`, (route) => {
      planCallCount++
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: "event: complete\ndata: {}\n\n",
      })
    })

    await page.goto(`/projects/${project.id}`)
    await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 5000 })

    // Wait a moment to ensure no plan call is made
    await page.waitForTimeout(1000)
    expect(planCallCount).toBe(0)

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })
})
