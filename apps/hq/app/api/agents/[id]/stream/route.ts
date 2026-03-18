export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { getAgentManager } = await import("@/lib/process/agent-manager")
  const agentManager = getAgentManager()
  const stream = agentManager.streamOutput(id)

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
