"use client"

import { use } from "react"
import { AgentList } from "@/components/agent-list"

export default function ProjectAgentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Agents for this project.
        </p>
      </div>
      <AgentList projectId={id} />
    </div>
  )
}
