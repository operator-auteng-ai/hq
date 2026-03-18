"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

interface OutputLine {
  type: string
  [key: string]: unknown
}

export function AgentOutput({
  agentId,
  onClose,
}: {
  agentId: string
  onClose: () => void
}) {
  const [lines, setLines] = useState<OutputLine[]>([])
  const [connected, setConnected] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    const eventSource = new EventSource(`/api/agents/${agentId}/stream`)

    eventSource.onopen = () => setConnected(true)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as OutputLine
        setLines((prev) => [...prev, data])
      } catch {
        // ignore parse errors
      }
    }

    eventSource.onerror = () => {
      setConnected(false)
      eventSource.close()
    }

    return () => eventSource.close()
  }, [agentId])

  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    autoScrollRef.current = isAtBottom
  }

  function extractText(line: OutputLine): string {
    if (line.type === "assistant" && line.message) {
      const msg = line.message as { content?: Array<{ type: string; text?: string }> }
      return (
        msg.content
          ?.filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("") ?? ""
      )
    }
    if (line.type === "done") {
      return `--- Agent ${(line as { status?: string }).status ?? "done"} ---`
    }
    if (line.type === "system") {
      return `[system] ${JSON.stringify(line)}`
    }
    return ""
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-sm">
          Agent Output
          {connected && (
            <span className="ml-2 inline-block h-2 w-2 rounded-full bg-status-running" />
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <XIcon className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-[400px] overflow-y-auto bg-black p-4 font-mono text-xs text-green-400"
        >
          {lines.length === 0 && (
            <span className="text-muted-foreground">Waiting for output...</span>
          )}
          {lines.map((line, i) => {
            const text = extractText(line)
            if (!text) return null
            return (
              <div key={i} className="whitespace-pre-wrap">
                {text}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
