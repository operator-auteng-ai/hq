import { request } from "@playwright/test"

export default async function globalTeardown() {
  const ctx = await request.newContext({
    baseURL: "http://localhost:3000",
  })

  await ctx.delete("/api/projects/test-cleanup")
  await ctx.dispose()
}
