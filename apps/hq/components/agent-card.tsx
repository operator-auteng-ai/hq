"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { XIcon, PlayIcon, MonitorIcon } from "lucide-react"
import { timeAgo } from "@/lib/time-ago"

interface AgentRun {
  id: string
  projectId: string
  prompt: string
  status: string
  model: string | null
  turnCount: number | null
  costUsd: number | null
  createdAt: string
  completedAt: string | null
  sessionId: string | null
}

export function AgentCard({
  agent,
  projectName,
  onCancel,
  onResume,
  onViewOutput,
}: {
  agent: AgentRun
  projectName?: string
  onCancel?: (id: string) => void
  onResume?: (id: string) => void
  onViewOutput?: (id: string) => void
}) {
  const isRunning = agent.status === "running" || agent.status === "queued"
  const canResume =
    (agent.status === "failed" || agent.status === "cancelled") &&
    agent.sessionId !== null

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={agent.status} />
            {projectName && (
              <span className="text-xs text-muted-foreground">{projectName}</span>
            )}
            {agent.model && (
              <span className="text-xs text-muted-foreground">{agent.model}</span>
            )}
          </div>
          <p className="truncate text-sm">{agent.prompt}</p>
          <div className="flex gap-3 text-xs text-muted-foreground">
            {agent.turnCount !== null && <span>{agent.turnCount} turns</span>}
            {agent.costUsd !== null && (
              <span>${agent.costUsd.toFixed(4)}</span>
            )}
            <span>{timeAgo(agent.createdAt)}</span>
          </div>
        </div>
        <div className="ml-4 flex gap-1">
          {onViewOutput && (
            <Button variant="ghost" size="sm" onClick={() => onViewOutput(agent.id)}>
              <MonitorIcon className="h-4 w-4" />
            </Button>
          )}
          {isRunning && onCancel && (
            <Button variant="ghost" size="sm" onClick={() => onCancel(agent.id)}>
              <XIcon className="h-4 w-4" />
            </Button>
          )}
          {canResume && onResume && (
            <Button variant="ghost" size="sm" onClick={() => onResume(agent.id)}>
              <PlayIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
