import { z } from "zod"

export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  prompt: z
    .string()
    .min(20, "Prompt must be at least 20 characters")
    .max(10000, "Prompt must be 10,000 characters or less"),
  model: z
    .enum(["sonnet", "opus", "haiku"])
    .default("sonnet"),
  isTest: z.boolean().optional().default(false),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z
    .enum(["draft", "planning", "building", "deployed", "paused", "archived"])
    .optional(),
  deployUrl: z.string().url().optional(),
  workspacePath: z.string().optional(),
  planningStep: z.string().optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
