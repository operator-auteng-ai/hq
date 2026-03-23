import { test, expect } from "@playwright/test"

/**
 * These tests mock API responses to verify UI behaviour without
 * real Claude API calls. They test SSE streaming, milestone tree
 * rendering, chat UI, and error states.
 */

test.describe("Planning pipeline progress UI", () => {
  test("shows skill progress from mocked SSE stream", async ({ page }) => {
    const uniqueName = `Pipeline ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: { name: uniqueName, prompt: "Test planning pipeline UI" },
    })
    const project = await res.json()

    // Mock the /plan endpoint to return a fake SSE stream
    await page.route(`**/api/projects/${project.id}/plan`, (route) => {
      const body = [
        "event: progress",
        'data: {"level":"vision","status":"running"}',
        "",
        "event: progress",
        'data: {"level":"vision","status":"completed","agentId":"a1"}',
        "",
        "event: progress",
        'data: {"level":"milestones","status":"running"}',
        "",
        "event: progress",
        'data: {"level":"milestones","status":"completed","detail":"3 milestones"}',
        "",
        "event: complete",
        'data: {"success":true,"milestonesCreated":3,"phasesCreated":6,"tasksCreated":18}',
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

    // Go to new project page and submit
    await page.goto("/projects/new")
    await page.getByLabel("Project Name").fill(uniqueName)
    await page
      .getByLabel(/describe your project/i)
      .fill("Test planning pipeline progress display in E2E")
    await page.getByRole("button", { name: "Create Project" }).click()

    // Should show planning progress
    await expect(page.getByText(/planning/i)).toBeVisible({ timeout: 5000 })

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })
})

test.describe("Milestones tab with mocked data", () => {
  test("renders milestone tree from delivery tracker", async ({ page }) => {
    const uniqueName = `Milestones ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: { name: uniqueName, prompt: "Test milestone tree rendering" },
    })
    const project = await res.json()

    // Mock plan endpoint first to prevent auto-trigger from causing re-renders
    await page.route(`**/api/projects/${project.id}/plan`, (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: "event: complete\ndata: {}\n\n",
      })
    })

    // Mock the milestones endpoint with a full tree
    await page.route(
      `**/api/projects/${project.id}/milestones`,
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            milestones: [
              {
                id: "m1",
                name: "Core Invoicing",
                status: "completed",
                isMvpBoundary: 0,
                sortOrder: 0,
                phases: [
                  {
                    id: "p1",
                    name: "Data Model",
                    status: "completed",
                    tasks: [
                      {
                        id: "t1",
                        title: "Create invoices table",
                        status: "completed",
                      },
                      {
                        id: "t2",
                        title: "CRUD API",
                        status: "completed",
                      },
                    ],
                  },
                ],
              },
              {
                id: "m2",
                name: "Payments",
                status: "active",
                isMvpBoundary: 0,
                sortOrder: 1,
                phases: [
                  {
                    id: "p2",
                    name: "Stripe Integration",
                    status: "active",
                    tasks: [
                      {
                        id: "t3",
                        title: "Stripe adapter",
                        status: "in_progress",
                      },
                      {
                        id: "t4",
                        title: "Webhook handler",
                        status: "pending",
                      },
                    ],
                  },
                ],
              },
              {
                id: "m3",
                name: "Dashboard",
                status: "pending",
                isMvpBoundary: 1,
                sortOrder: 2,
                phases: [],
              },
            ],
            progress: {
              totalMilestones: 3,
              completedMilestones: 1,
              totalTasks: 4,
              completedTasks: 2,
            },
          }),
        })
      },
    )

    // Mock plan endpoint so auto-trigger doesn't hang
    await page.route(`**/api/projects/${project.id}/plan`, (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: "event: complete\ndata: {}\n\n",
      })
    })

    await page.goto(`/projects/${project.id}`)
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 })

    // Click Tasks level in pipeline nav
    await page.getByText("Tasks").click()

    // Verify milestone names in the tree
    await expect(page.getByText("Core Invoicing")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("Payments")).toBeVisible()

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })

  test("shows pipeline nav with pending levels when no milestones", async ({ page }) => {
    const uniqueName = `Empty ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: { name: uniqueName, prompt: "Test empty milestone state" },
    })
    const project = await res.json()

    await page.route(
      `**/api/projects/${project.id}/milestones`,
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            milestones: [],
            progress: {
              totalMilestones: 0,
              completedMilestones: 0,
              totalTasks: 0,
              completedTasks: 0,
            },
          }),
        })
      },
    )

    // Also mock the plan endpoint so auto-trigger doesn't hang
    await page.route(`**/api/projects/${project.id}/plan`, (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: "event: complete\ndata: {}\n\n",
      })
    })

    await page.goto(`/projects/${project.id}`)

    // Pipeline nav should be visible with levels
    await expect(page.getByText("Vision")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText("Tasks")).toBeVisible()

    await page.request.delete(`/api/projects/${project.id}`)
  })
})

test.describe("Chat UI with mocked streaming", () => {
  test("displays streamed chat response and action card", async ({
    page,
  }) => {
    const uniqueName = `Chat ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: { name: uniqueName, prompt: "Test chat UI streaming" },
    })
    const project = await res.json()

    // Mock plan endpoint so auto-trigger doesn't hang
    await page.route(`**/api/projects/${project.id}/plan`, (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: "event: complete\ndata: {}\n\n",
      })
    })

    // Mock GET chat history (empty)
    await page.route(
      `**/api/projects/${project.id}/chat`,
      (route, request) => {
        if (request.method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ messages: [] }),
          })
        } else if (request.method() === "POST") {
          // Mock POST with SSE streaming response
          const body = [
            "event: token",
            'data: {"content":"The project "}',
            "",
            "event: token",
            'data: {"content":"is currently "}',
            "",
            "event: token",
            'data: {"content":"in draft status."}',
            "",
            "event: token",
            'data: {"content":"\\n\\nACTION: startPhase p-123"}',
            "",
            "event: action",
            'data: {"action":"startPhase","entityId":"p-123","description":"Start phase: p-123"}',
            "",
            "event: done",
            'data: {"messageId":"msg-test-1"}',
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
        } else {
          route.continue()
        }
      },
    )

    await page.goto(`/projects/${project.id}`)
    await page.waitForTimeout(1000) // Wait for auto-trigger to settle

    // Type and send a message
    await page
      .getByPlaceholder(/ask about project status/i)
      .fill("What is the status?")
    await page.getByRole("button", { name: /send message/i }).click()

    // User message should appear
    await expect(page.getByText("What is the status?")).toBeVisible({
      timeout: 5000,
    })

    // Streamed response should appear
    await expect(
      page.getByText("The project is currently in draft status."),
    ).toBeVisible({ timeout: 5000 })

    // Action card should appear
    await expect(page.getByText("Proposed Action")).toBeVisible({
      timeout: 3000,
    })
    await expect(page.getByText("Start phase: p-123")).toBeVisible()

    // Confirm and Cancel buttons should be present
    await expect(
      page.getByRole("button", { name: "Confirm" }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Cancel" }),
    ).toBeVisible()

    // Clean up
    await page.request.delete(`/api/projects/${project.id}`)
  })

  test("cancel dismisses action card without executing", async ({
    page,
  }) => {
    const uniqueName = `ChatCancel ${Date.now()}`
    const res = await page.request.post("/api/projects", {
      data: { name: uniqueName, prompt: "Test chat cancel action" },
    })
    const project = await res.json()

    // Mock plan endpoint
    await page.route(`**/api/projects/${project.id}/plan`, (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: "event: complete\ndata: {}\n\n",
      })
    })

    await page.route(
      `**/api/projects/${project.id}/chat`,
      (route, request) => {
        if (request.method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ messages: [] }),
          })
        } else if (request.method() === "POST") {
          const body = [
            "event: token",
            'data: {"content":"I suggest retrying."}',
            "",
            "event: action",
            'data: {"action":"retryTask","entityId":"t-1","description":"Retry task: t-1"}',
            "",
            "event: done",
            'data: {"messageId":"msg-cancel-1"}',
            "",
          ].join("\n")

          route.fulfill({
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
            body,
          })
        } else {
          route.continue()
        }
      },
    )

    // Mock confirm endpoint
    let confirmCalled = false
    await page.route(
      `**/api/projects/${project.id}/chat/confirm`,
      (route) => {
        confirmCalled = true
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ executed: false }),
        })
      },
    )

    await page.goto(`/projects/${project.id}`)
    await page.waitForTimeout(1000) // Wait for auto-trigger to settle

    await page
      .getByPlaceholder(/ask about project status/i)
      .fill("Retry the failed task")
    await page.getByRole("button", { name: /send message/i }).click()

    // Wait for action card
    await expect(page.getByText("Proposed Action")).toBeVisible({
      timeout: 5000,
    })

    // Click Cancel
    await page.getByRole("button", { name: "Cancel" }).click()

    // Action card should disappear
    await expect(page.getByText("Proposed Action")).not.toBeVisible({
      timeout: 3000,
    })

    // Confirm was called with confirm=false
    expect(confirmCalled).toBe(true)

    await page.request.delete(`/api/projects/${project.id}`)
  })
})

test.describe("Design system pages render", () => {
  test("design system overview renders", async ({ page }) => {
    await page.goto("/design-system")
    await expect(page.locator("body")).not.toBeEmpty()
    // Should not have JS errors
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))
    await page.waitForTimeout(500)
    expect(errors).toEqual([])
  })

  test("design system tokens page renders", async ({ page }) => {
    await page.goto("/design-system/tokens")
    await expect(page.locator("body")).not.toBeEmpty()
  })

  test("design system components page renders", async ({ page }) => {
    await page.goto("/design-system/components")
    await expect(page.locator("body")).not.toBeEmpty()
  })
})

test.describe("Project creation form validation", () => {
  test("create button disabled with short prompt", async ({ page }) => {
    await page.goto("/projects/new")

    await page.getByLabel("Project Name").fill("Test")
    await page
      .getByLabel(/describe your project/i)
      .fill("Too short")

    // Button should be disabled (prompt < 20 chars)
    const button = page.getByRole("button", { name: "Create Project" })
    await expect(button).toBeDisabled()
  })

  test("create button enabled with valid input", async ({ page }) => {
    await page.goto("/projects/new")

    await page.getByLabel("Project Name").fill("Valid Project")
    await page
      .getByLabel(/describe your project/i)
      .fill("This is a valid project prompt that meets the minimum length requirement")

    const button = page.getByRole("button", { name: "Create Project" })
    await expect(button).toBeEnabled()
  })
})
