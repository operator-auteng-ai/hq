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
import {
  ArrowLeftIcon,
  ArchiveIcon,
  RefreshCwIcon,
  FolderIcon,
  Loader2Icon,
  PlayIcon,
  CheckIcon,
  XIcon,
  SkipForwardIcon,
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
  phases: Array<{
    id: string
    phaseNumber: number
    name: string
    status: string
    exitCriteria: string | null
  }>
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
  const [generating, setGenerating] = useState(false)
  const [genStatus, setGenStatus] = useState("")
  const [genError, setGenError] = useState("")
  const [agents, setAgents] = useState<AgentRun[]>([])
  const [viewingOutput, setViewingOutput] = useState<string | null>(null)

  useEffect(() => {
    loadProject()
    loadAgents()
    const interval = setInterval(loadAgents, 3000)
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

  async function handleStartPhase(phaseId: string) {
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id, prompt: `Implement phase`, phaseId }),
    })
    if (res.ok) {
      const data = await res.json()
      setViewingOutput(data.agentId)
      loadAgents()
      loadProject()
    }
  }

  async function handlePhaseAction(phaseId: string, action: string) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseAction: { phaseId, action } }),
    })
    loadProject()
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

  async function handleGenerate() {
    if (!project || generating) return
    setGenerating(true)
    setGenStatus("Starting...")
    setGenError("")

    try {
      const res = await fetch(`/api/projects/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "sonnet" }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setGenError(err.error || `Server error (${res.status})`)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let errorMessage = ""

      if (reader) {
        let done = false
        let nextIsError = false
        while (!done) {
          const result = await reader.read()
          done = result.done
          if (result.value) {
            const text = decoder.decode(result.value)
            for (const line of text.split("\n")) {
              if (line.startsWith("event: error")) {
                nextIsError = true
              }
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6))
                  if (nextIsError && data.message) {
                    errorMessage = data.message
                    nextIsError = false
                  } else if (data.message) {
                    setGenStatus(data.message)
                  }
                } catch {
                  // ignore partial JSON
                }
              }
            }
          }
        }
      }

      if (errorMessage) {
        setGenError(errorMessage)
      } else {
        await loadProject()
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
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
          {!hasDocs && (
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Docs"
              )}
            </Button>
          )}
          {hasDocs && (
            <Button variant="outline" onClick={handleGenerate} disabled={generating}>
              <RefreshCwIcon className="mr-2 h-4 w-4" />
              Regenerate
            </Button>
          )}
          <Button variant="outline" onClick={handleArchive}>
            <ArchiveIcon className="mr-2 h-4 w-4" />
            Archive
          </Button>
        </div>
      </div>

      {generating && genStatus && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          {genStatus}
        </div>
      )}

      {!generating && genError && (
        <div data-testid="gen-error" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {genError}
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
      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
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

        <TabsContent value="phases" className="mt-4">
          {project.phases.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No phases defined. Phases are parsed from the generated PLAN.md.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {project.phases.map((phase) => (
                <Card key={phase.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <span className="mr-2 text-xs text-muted-foreground">
                        Phase {phase.phaseNumber}
                      </span>
                      <span className="font-medium">{phase.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={phase.status} />
                      {phase.status === "pending" && hasDocs && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStartPhase(phase.id)}
                        >
                          <PlayIcon className="mr-1 h-3 w-3" />
                          Start
                        </Button>
                      )}
                      {phase.status === "review" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePhaseAction(phase.id, "approve")}
                          >
                            <CheckIcon className="mr-1 h-3 w-3" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePhaseAction(phase.id, "reject")}
                          >
                            <XIcon className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePhaseAction(phase.id, "skip")}
                          >
                            <SkipForwardIcon className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agents" className="mt-4 space-y-4">
          {viewingOutput && (
            <AgentOutput
              agentId={viewingOutput}
              onClose={() => setViewingOutput(null)}
            />
          )}

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
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onCancel={handleCancelAgent}
                  onResume={handleResumeAgent}
                  onViewOutput={setViewingOutput}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deploys" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Deployment management will be available in Phase 3.
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
