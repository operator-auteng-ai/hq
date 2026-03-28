"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { AgentCard } from "@/components/agent-card"
import { AgentOutput } from "@/components/agent-output"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AgentRun {
  id: string
  projectId: string
  projectName?: string
  phaseLabel: string | null
  prompt: string
  status: string
  model: string | null
  turnCount: number | null
  costUsd: number | null
  createdAt: string
  completedAt: string | null
  sessionId: string | null
}

const FILTERS = [
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
] as const

type FilterValue = (typeof FILTERS)[number]["value"]

function matchesFilter(agent: AgentRun, filter: FilterValue): boolean {
  if (filter === "all") return true
  if (filter === "running") return agent.status === "running" || agent.status === "queued"
  return agent.status === filter
}

function sortByNewest(a: AgentRun, b: AgentRun): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

export function AgentList({
  projectId,
  showProjectName,
}: {
  projectId?: string
  showProjectName?: boolean
}) {
  const [agents, setAgents] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingOutput, setViewingOutput] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterValue>("running")

  const loadAgents = useCallback(async () => {
    const url = projectId ? `/api/agents?projectId=${projectId}` : "/api/agents"
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      setAgents(data)
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    async function initialLoad() {
      const url = projectId ? `/api/agents?projectId=${projectId}` : "/api/agents"
      const res = await fetch(url, { signal: controller.signal })
      if (res.ok) {
        setAgents(await res.json())
      }
      setLoading(false)
    }
    initialLoad().catch(() => {})
    const interval = setInterval(() => void loadAgents(), 3000)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [projectId, loadAgents])

  async function handleCancel(id: string) {
    await fetch(`/api/agents/${id}`, { method: "DELETE" })
    loadAgents()
  }

  async function handleResume(id: string) {
    const res = await fetch(`/api/agents/${id}/resume`, { method: "POST" })
    if (res.ok) {
      const data = await res.json()
      setViewingOutput(data.agentId)
    }
    loadAgents()
  }

  const counts = useMemo(() => {
    const c: Record<FilterValue, number> = { running: 0, completed: 0, failed: 0, cancelled: 0, all: 0 }
    for (const a of agents) {
      c.all++
      if (a.status === "running" || a.status === "queued") c.running++
      else if (a.status === "completed") c.completed++
      else if (a.status === "failed") c.failed++
      else if (a.status === "cancelled") c.cancelled++
    }
    return c
  }, [agents])

  const filtered = useMemo(
    () => agents.filter((a) => matchesFilter(a, filter)).sort(sortByNewest),
    [agents, filter],
  )

  const showCancel = filter === "running" || filter === "all"
  const showResume = filter !== "running"

  return (
    <>
      {viewingOutput && (
        <AgentOutput
          agentId={viewingOutput}
          onClose={() => setViewingOutput(null)}
        />
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
              {counts[f.value] > 0 && (
                <span className="ml-1.5 rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums">
                  {counts[f.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              projectName={showProjectName ? agent.projectName : undefined}
              onCancel={showCancel && (agent.status === "running" || agent.status === "queued") ? handleCancel : undefined}
              onResume={showResume && (agent.status === "failed" || agent.status === "cancelled") ? handleResume : undefined}
              onViewOutput={setViewingOutput}
            />
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          {agents.length === 0
            ? "No agents have been spawned yet."
            : `No ${filter === "all" ? "" : filter} agents.`}
        </div>
      )}
    </>
  )
}
