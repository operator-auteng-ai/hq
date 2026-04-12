import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { getBackgroundProcessManager } from "./background-process-manager"
import { getDeliveryTracker } from "@/lib/services/delivery-tracker"
import type { BackgroundProcessType } from "./types"

export function createHqMcpServer(projectId: string) {
  const bgManager = getBackgroundProcessManager()
  const tracker = getDeliveryTracker()

  const getProcessOutput = tool(
    "get_process_output",
    "Get recent output from background processes (dev servers, test watchers, build watchers). Returns the last N lines from the ring buffer.",
    {
      processType: z
        .enum(["dev_server", "test_watcher", "build_watcher", "custom"])
        .optional()
        .describe("Filter by process type. Omit to get all."),
      lines: z
        .number()
        .int()
        .positive()
        .default(50)
        .describe("Number of recent lines to retrieve (default 50)"),
    },
    async (args) => {
      const processes = bgManager.getByProject(projectId)
      const filtered = args.processType
        ? processes.filter((p) => p.processType === args.processType)
        : processes

      if (filtered.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No background processes running for this project.",
            },
          ],
        }
      }

      const output = filtered
        .map((p) => {
          const lines = bgManager.getOutput(p.id, args.lines)
          return `=== ${p.processType} (${p.command} ${p.args.join(" ")}) [${p.status}] ===\n${lines.join("\n")}`
        })
        .join("\n\n")

      return { content: [{ type: "text" as const, text: output }] }
    },
  )

  const getDevServerUrl = tool(
    "get_dev_server_url",
    "Get the URL of the running dev server for this project.",
    {},
    async () => {
      const url = bgManager.getDevServerUrl(projectId)
      return {
        content: [
          {
            type: "text" as const,
            text: url ?? "No dev server running for this project.",
          },
        ],
      }
    },
  )

  const getProcessStatus = tool(
    "get_process_status",
    "Get the status of all background processes for this project.",
    {},
    async () => {
      const processes = bgManager.getByProject(projectId)
      if (processes.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No background processes for this project.",
            },
          ],
        }
      }

      const statuses = processes.map(
        (p) =>
          `${p.processType}: ${p.status}${p.url ? ` (${p.url})` : ""} — ${p.command} ${p.args.join(" ")}`,
      )
      return {
        content: [{ type: "text" as const, text: statuses.join("\n") }],
      }
    },
  )

  const startProcess = tool(
    "start_process",
    "Start a background process (dev server, test watcher, or build watcher) in the project workspace.",
    {
      processType: z
        .enum(["dev_server", "test_watcher", "build_watcher", "custom"])
        .describe("Type of process to start"),
      command: z.string().describe("Command to run (e.g., 'npm', 'npx', 'pnpm')"),
      args: z
        .array(z.string())
        .default([])
        .describe("Command arguments (e.g., ['run', 'dev'])"),
    },
    async (args) => {
      try {
        // Get project workspace path from the existing processes or derive from cwd
        const existing = bgManager.getByProject(projectId)
        const cwd =
          existing.length > 0
            ? existing[0].cwd
            : process.cwd()

        const bp = await bgManager.start(
          projectId,
          args.processType as BackgroundProcessType,
          args.command,
          args.args,
          cwd,
        )
        return {
          content: [
            {
              type: "text" as const,
              text: `Started ${args.processType}: ${args.command} ${args.args.join(" ")} (id: ${bp.id})`,
            },
          ],
        }
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to start process: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        }
      }
    },
  )

  const stopProcess = tool(
    "stop_process",
    "Stop background processes for this project.",
    {
      processType: z
        .enum(["dev_server", "test_watcher", "build_watcher", "custom"])
        .optional()
        .describe("Stop processes of this type. Omit to stop all."),
    },
    async (args) => {
      const processes = bgManager.getByProject(projectId)
      const toStop = args.processType
        ? processes.filter((p) => p.processType === args.processType)
        : processes

      await Promise.all(toStop.map((p) => bgManager.stop(p.id)))

      return {
        content: [
          {
            type: "text" as const,
            text: `Stopped ${toStop.length} process(es).`,
          },
        ],
      }
    },
  )

  // ── Planning tools (milestones) ──────────────────────────────────────

  const listMilestones = tool(
    "list_milestones",
    "List the current milestones for this project from the database. Returns each milestone's name, description, MVP boundary flag, sort order, and status. Call this before set_milestones in re-run mode so you can preserve fields you don't intend to change.",
    {},
    async () => {
      const milestones = tracker.getMilestones(projectId)
      if (milestones.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No milestones exist yet for this project." },
          ],
        }
      }
      const payload = milestones.map((m) => ({
        name: m.name,
        description: m.description,
        isMvpBoundary: m.isMvpBoundary === 1,
        sortOrder: m.sortOrder,
        status: m.status,
      }))
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      }
    },
  )

  const setMilestones = tool(
    "set_milestones",
    "Replace the project's milestone set with the given ordered list. Milestones are keyed by name: existing milestones keep their id and status, new names are inserted as 'pending', names not in the list are deleted. Exactly one milestone should have isMvpBoundary=true (the last milestone of the MVP scope). Order in the array determines sortOrder.",
    {
      milestones: z
        .array(
          z.object({
            name: z
              .string()
              .min(1)
              .describe("Milestone name — e.g. 'Photo Onboarding'. Used as the key for upsert."),
            description: z
              .string()
              .min(1)
              .describe("One-sentence description of the user-visible capability this milestone delivers."),
            isMvpBoundary: z
              .boolean()
              .default(false)
              .describe("True if this is the last milestone of the MVP scope. Exactly one milestone should have this set."),
          }),
        )
        .min(1)
        .describe("Ordered list of milestones. Array position becomes sortOrder (0-indexed)."),
    },
    async (args) => {
      try {
        const mvpCount = args.milestones.filter((m) => m.isMvpBoundary).length
        if (mvpCount > 1) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${mvpCount} milestones have isMvpBoundary=true. Exactly one should mark the MVP boundary.`,
              },
            ],
          }
        }

        const result = tracker.setMilestones(projectId, args.milestones)
        return {
          content: [
            {
              type: "text" as const,
              text: `Saved ${result.length} milestone(s) to the database.\n\n${result
                .map(
                  (m, i) =>
                    `${i + 1}. ${m.name}${m.isMvpBoundary === 1 ? " <- MVP" : ""} (${m.status})`,
                )
                .join("\n")}`,
            },
          ],
        }
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to set milestones: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        }
      }
    },
  )

  return createSdkMcpServer({
    name: "hq",
    version: "1.0.0",
    tools: [
      getProcessOutput,
      getDevServerUrl,
      getProcessStatus,
      startProcess,
      stopProcess,
      listMilestones,
      setMilestones,
    ],
  })
}
