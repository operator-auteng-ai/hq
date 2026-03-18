"use client"

import { useEffect, useState, useCallback } from "react"
import { AgentCard } from "@/components/agent-card"
import { AgentOutput } from "@/components/agent-output"
import { Skeleton } from "@/components/ui/skeleton"

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

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingOutput, setViewingOutput] = useState<string | null>(null)

  const loadAgents = useCallback(async () => {
    const res = await fetch("/api/agents")
    if (res.ok) {
      const data = await res.json()
      setAgents(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // Initial load + polling
    void loadAgents()
    const interval = setInterval(() => void loadAgents(), 3000)
    return () => clearInterval(interval)
  }, [loadAgents])

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

  const running = agents.filter(
    (a) => a.status === "running" || a.status === "queued",
  )
  const recent = agents
    .filter((a) => a.status !== "running" && a.status !== "queued")
    .slice(0, 20)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor running dev agents across all projects.
        </p>
      </div>

      {viewingOutput && (
        <AgentOutput
          agentId={viewingOutput}
          onClose={() => setViewingOutput(null)}
        />
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          {running.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Running ({running.length})
              </h2>
              <div className="space-y-2">
                {running.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onCancel={handleCancel}
                    onViewOutput={setViewingOutput}
                  />
                ))}
              </div>
            </section>
          )}

          {recent.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Recent
              </h2>
              <div className="space-y-2">
                {recent.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onResume={handleResume}
                    onViewOutput={setViewingOutput}
                  />
                ))}
              </div>
            </section>
          )}

          {agents.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No agents have been spawned yet. Start a phase from a project to
              spawn agents.
            </div>
          )}
        </>
      )}
    </div>
  )
}
