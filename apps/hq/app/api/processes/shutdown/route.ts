import { NextResponse } from "next/server"

export async function POST() {
  try {
    const { getProcessRegistry } = await import("@/lib/process/process-registry")
    const { getBackgroundProcessManager } = await import(
      "@/lib/process/background-process-manager"
    )
    const { getAgentManager } = await import("@/lib/process/agent-manager")

    const registry = getProcessRegistry()
    const bgManager = getBackgroundProcessManager()
    const agentManager = getAgentManager()

    // Cancel all running agents
    for (const agent of agentManager.listAll()) {
      agentManager.cancel(agent.id)
    }

    // Stop all background processes
    await bgManager.stopAll()

    // Clear the registry
    await registry.shutdownAll()

    return NextResponse.json({ status: "shutdown complete" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Shutdown failed" },
      { status: 500 },
    )
  }
}
