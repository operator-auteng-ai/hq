"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/status-badge"
import { AgentCard } from "@/components/agent-card"
import { AgentOutput } from "@/components/agent-output"
import { ProcessStatusPanel } from "@/components/process-status"
import { OrchestratorChat } from "@/components/orchestrator-chat"
import {
  ArrowLeftIcon,
  ArchiveIcon,
  FolderIcon,
} from "lucide-react"

interface Project {
  id: string
  name: string
  prompt: string
  status: string
  workspacePath: string | null
  deployUrl: string | null
  createdAt: string
  updatedAt: string
}

interface MilestoneTree {
  milestones: Array<{
    id: string
    name: string
    status: string
    isMvpBoundary: number
    phases: Array<{
      id: string
      name: string
      status: string
      tasks: Array<{
        id: string
        title: string
        status: string
      }>
    }>
  }>
  progress: {
    totalMilestones: number
    completedMilestones: number
    totalTasks: number
    completedTasks: number
  }
}

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

interface ProjectDocs {
  vision: string | null
  arch: string | null
  plan: string | null
  taxonomy: string | null
  codingStandards: string | null
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [docs, setDocs] = useState<ProjectDocs | null>(null)
  const [loading, setLoading] = useState(true)
  const [docsLoading, setDocsLoading] = useState(false)
  const [error, setError] = useState("")
  const [milestones, setMilestones] = useState<MilestoneTree | null>(null)
  const [agents, setAgents] = useState<AgentRun[]>([])
  const [viewingOutput, setViewingOutput] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("docs")

  useEffect(() => {
    loadProject()
    loadAgents()
    const interval = setInterval(() => {
      loadAgents()
      loadMilestones()
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function loadProject() {
    setLoading(true)
    const res = await fetch(`/api/projects/${id}`)
    if (!res.ok) {
      router.push("/projects")
      return
    }
    const data = await res.json()
    setProject(data)
    setLoading(false)

    if (data.workspacePath) {
      loadDocs()
      loadMilestones()
    }
  }

  async function loadMilestones() {
    const res = await fetch(`/api/projects/${id}/milestones`)
    if (res.ok) {
      setMilestones(await res.json())
    }
  }

  async function loadDocs() {
    setDocsLoading(true)
    const res = await fetch(`/api/projects/${id}/docs`)
    if (res.ok) {
      setDocs(await res.json())
    }
    setDocsLoading(false)
  }

  async function loadAgents() {
    const res = await fetch(`/api/agents?projectId=${id}`)
    if (res.ok) {
      setAgents(await res.json())
    }
  }

  async function handleCancelAgent(agentId: string) {
    await fetch(`/api/agents/${agentId}`, { method: "DELETE" })
    loadAgents()
  }

  async function handleResumeAgent(agentId: string) {
    const res = await fetch(`/api/agents/${agentId}/resume`, { method: "POST" })
    if (res.ok) {
      const data = await res.json()
      setViewingOutput(data.agentId)
    }
    loadAgents()
  }

  async function handleArchive() {
    if (!project) return
    await fetch(`/api/projects/${id}`, {
      method: "DELETE",
    })
    router.push("/projects")
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!project) return null

  const hasDocs = project.workspacePath !== null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push("/projects")}>
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="ml-11 text-sm text-muted-foreground">
            Created {new Date(project.createdAt).toLocaleDateString()}
            {project.workspacePath && (
              <span className="ml-3 inline-flex items-center gap-1">
                <FolderIcon className="h-3 w-3" />
                {project.workspacePath}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleArchive}>
            <ArchiveIcon className="mr-2 h-4 w-4" />
            Archive
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Project Prompt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{project.prompt}</p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="deploys" disabled>
            Deploys
          </TabsTrigger>
        </TabsList>

        <TabsContent value="docs" className="mt-4">
          {!hasDocs ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No docs generated yet. Click &ldquo;Generate Docs&rdquo; to
                  create workflow documents from your prompt.
                </p>
              </CardContent>
            </Card>
          ) : docsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : docs ? (
            <DocTabs docs={docs} />
          ) : null}
        </TabsContent>

        <TabsContent value="milestones" className="mt-4">
          {!milestones || milestones.milestones.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {project.status === "planning"
                    ? "Planning in progress — milestones will appear when the pipeline completes."
                    : "No milestones yet."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {milestones.progress && (
                <div className="text-sm text-muted-foreground">
                  {milestones.progress.completedMilestones}/{milestones.progress.totalMilestones} milestones,{" "}
                  {milestones.progress.completedTasks}/{milestones.progress.totalTasks} tasks
                </div>
              )}
              {milestones.milestones.map((milestone) => (
                <Card key={milestone.id}>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{milestone.name}</CardTitle>
                        {milestone.isMvpBoundary === 1 && (
                          <span className="text-xs text-muted-foreground">&larr; MVP</span>
                        )}
                      </div>
                      <StatusBadge status={milestone.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="py-2">
                    {milestone.phases.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No phases yet</p>
                    ) : (
                      <div className="space-y-2">
                        {milestone.phases.map((phase) => (
                          <div key={phase.id} className="rounded-md border p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">{phase.name}</span>
                              <StatusBadge status={phase.status} />
                            </div>
                            {phase.tasks.length > 0 && (
                              <div className="space-y-1 ml-2">
                                {phase.tasks.map((task) => (
                                  <div key={task.id} className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{task.title}</span>
                                    <StatusBadge status={task.status} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agents" className="mt-4 space-y-4">
          <ProcessStatusPanel projectId={id} />

          {agents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No agents have been spawned for this project. Start a phase to
                  begin agent execution.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id}>
                  <AgentCard
                    agent={agent}
                    onCancel={handleCancelAgent}
                    onResume={handleResumeAgent}
                    onViewOutput={(id) =>
                      setViewingOutput((prev) => (prev === id ? null : id))
                    }
                  />
                  {viewingOutput === agent.id && (
                    <div className="mt-1">
                      <AgentOutput
                        agentId={agent.id}
                        onClose={() => setViewingOutput(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <Card>
            <OrchestratorChat projectId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="deploys" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Deployment management will be available in a future version.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

const DOC_TABS = [
  { key: "vision", label: "VISION.md" },
  { key: "arch", label: "ARCH.md" },
  { key: "plan", label: "PLAN.md" },
  { key: "taxonomy", label: "TAXONOMY.md" },
  { key: "codingStandards", label: "CODING-STANDARDS.md" },
] as const

function DocTabs({ docs }: { docs: ProjectDocs }) {
  return (
    <Tabs defaultValue="vision">
      <TabsList>
        {DOC_TABS.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {DOC_TABS.map((tab) => (
        <TabsContent key={tab.key} value={tab.key} className="mt-4">
          <Card>
            <CardContent className="py-4">
              {docs[tab.key] ? (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                  {docs[tab.key]}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This document was not generated.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  )
}
