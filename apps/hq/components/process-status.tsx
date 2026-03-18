"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { SquareIcon } from "lucide-react"

interface BackgroundProcess {
  id: string
  projectId: string
  processType: string
  command: string
  args: string | null
  status: string
  port: number | null
  url: string | null
  startedAt: string
  stoppedAt: string | null
}

export function ProcessStatusPanel({ projectId }: { projectId: string }) {
  const [processes, setProcesses] = useState<BackgroundProcess[]>([])
  const [outputs, setOutputs] = useState<Record<string, string[]>>({})

  useEffect(() => {
    loadProcesses()
    const interval = setInterval(loadProcesses, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function loadProcesses() {
    const res = await fetch(`/api/processes?projectId=${projectId}`)
    if (res.ok) {
      setProcesses(await res.json())
    }
  }

  async function loadOutput(processId: string) {
    const res = await fetch(`/api/processes/${processId}/output?lines=20`)
    if (res.ok) {
      const data = await res.json()
      setOutputs((prev) => ({ ...prev, [processId]: data.lines }))
    }
  }

  async function handleStop(processId: string) {
    await fetch(`/api/processes/${processId}`, { method: "DELETE" })
    loadProcesses()
  }

  const running = processes.filter(
    (p) => p.status === "running" || p.status === "starting",
  )

  if (running.length === 0) return null

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Background Processes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {running.map((p) => (
          <div key={p.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge status={p.status} />
                <span className="text-sm font-medium">{p.processType}</span>
                <span className="text-xs text-muted-foreground">
                  {p.command} {p.args ? JSON.parse(p.args).join(" ") : ""}
                </span>
                {p.url && (
                  <span className="text-xs text-blue-500">{p.url}</span>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadOutput(p.id)}
                >
                  Logs
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStop(p.id)}
                >
                  <SquareIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {outputs[p.id] && (
              <div className="max-h-32 overflow-y-auto rounded bg-black p-2 font-mono text-xs text-green-400">
                {outputs[p.id].map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
