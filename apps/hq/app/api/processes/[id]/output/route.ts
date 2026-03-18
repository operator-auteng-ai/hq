import { NextResponse } from "next/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const lines = parseInt(url.searchParams.get("lines") ?? "50", 10)

    const { getBackgroundProcessManager } = await import(
      "@/lib/process/background-process-manager"
    )
    const bgManager = getBackgroundProcessManager()
    const output = bgManager.getOutput(id, lines)

    return NextResponse.json({ lines: output })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get output" },
      { status: 500 },
    )
  }
}
