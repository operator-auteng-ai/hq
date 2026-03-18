import { NextResponse } from "next/server"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { getAgentManager } = await import("@/lib/process/agent-manager")
    const agentManager = getAgentManager()
    const newAgentId = await agentManager.resume(id)

    return NextResponse.json({ agentId: newAgentId }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resume agent" },
      { status: 500 },
    )
  }
}
