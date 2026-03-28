"use client"

import { useEffect, useState, useCallback, useRef, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { PipelineNav, type PipelineLevel } from "@/components/pipeline-nav"
import { type MilestoneTreeData } from "@/components/milestone-tree"
import { OrchestratorChat } from "@/components/orchestrator-chat"
import { ArtifactViewer, type ProjectDocs } from "@/components/artifact-viewer"
import { type SystemMessageData } from "@/components/system-message"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeftIcon, ArchiveIcon, FolderIcon } from "lucide-react"

interface Project {
  id: string
  name: string
  prompt: string
  status: string
  collaborationProfile: string | null
  planningStep: string | null
  workspacePath: string | null
  deployUrl: string | null
  createdAt: string
  updatedAt: string
}

function mapProgressToIcon(status: string): SystemMessageData["icon"] {
  switch (status) {
    case "running":
      return "running"
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "awaiting_review":
      return "info"
    default:
      return "info"
  }
}

function mapProgressToContent(level: string, status: string, detail?: string): string {
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1)
  if (detail) return `${levelLabel}: ${detail}`
  switch (status) {
    case "running":
      return `${levelLabel} running...`
    case "completed":
      return `${levelLabel} completed`
    case "failed":
      return `${levelLabel} failed`
    case "awaiting_review":
      return `${levelLabel} awaiting review`
    default:
      return `${levelLabel}: ${status}`
  }
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<ProjectDocs | null>(null)
  const [milestones, setMilestones] = useState<MilestoneTreeData | null>(null)
  const [activeLevel, setActiveLevel] = useState<PipelineLevel>("vision")
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const pipelineTriggered = useRef(false)
  const [awaitingReview, setAwaitingReview] = useState<string | null>(null)
  const [systemMessages, setSystemMessages] = useState<SystemMessageData[]>([])

  const addSystemMessage = useCallback(
    (content: string, icon: SystemMessageData["icon"]) => {
      const msg: SystemMessageData = {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: "system",
        content,
        icon,
        timestamp: new Date().toISOString(),
      }
      setSystemMessages((prev) => [...prev, msg])
    },
    [],
  )

  const loadMilestones = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/milestones`)
    if (res.ok) {
      setMilestones(await res.json())
    }
  }, [id])

  const loadDocs = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/docs`)
    if (res.ok) {
      setDocs(await res.json())
    }
  }, [id])

  const loadProject = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/projects/${id}`)
    if (!res.ok) {
      router.push("/projects")
      return
    }
    const data: Project = await res.json()
    setProject(data)
    setLoading(false)

    if (data.workspacePath) {
      loadDocs()
      loadMilestones()
    }
  }, [id, router, loadDocs, loadMilestones])

  // Load project on mount
  useEffect(() => {
    loadProject()
  }, [loadProject])

  // Poll milestones every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      loadMilestones()
    }, 5000)
    return () => clearInterval(interval)
  }, [loadMilestones])

  // Trigger pipeline for draft projects or resume after review
  const triggerPipeline = useCallback(async () => {
    if (pipelineRunning) return
    setPipelineRunning(true)
    pipelineTriggered.current = true
    setAwaitingReview(null)

    addSystemMessage("Starting planning pipeline...", "info")

    try {
      const profile = project?.collaborationProfile ?? "operator"
      const res = await fetch(`/api/projects/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "sonnet", collaborationProfile: profile }),
      })

      if (res.ok && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let currentEvent = ""
        let done = false

        while (!done) {
          const result = await reader.read()
          done = result.done
          if (result.value) {
            const chunk = decoder.decode(result.value, { stream: true })
            for (const line of chunk.split("\n")) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim()
              } else if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6))

                  if (currentEvent === "progress") {
                    addSystemMessage(
                      mapProgressToContent(data.level, data.status, data.detail),
                      mapProgressToIcon(data.status),
                    )
                    // Refresh docs when a level completes
                    if (data.status === "completed") {
                      loadDocs()
                      loadMilestones()
                    }
                  }

                  if (currentEvent === "complete") {
                    if (data.awaitingReview) {
                      setAwaitingReview(data.awaitingReview)
                      setPipelineRunning(false)
                      addSystemMessage(
                        `Pipeline paused — awaiting review of ${data.awaitingReview}`,
                        "info",
                      )
                    } else {
                      addSystemMessage("Planning pipeline completed", "completed")
                    }
                  }

                  if (currentEvent === "error") {
                    addSystemMessage(
                      `Pipeline error: ${data.error ?? "Unknown error"}`,
                      "failed",
                    )
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }
          }
        }
      }
    } catch {
      addSystemMessage("Pipeline connection failed", "failed")
    } finally {
      setPipelineRunning(false)
      loadProject()
      loadDocs()
      loadMilestones()
    }
  }, [id, project?.collaborationProfile, pipelineRunning, loadProject, loadDocs, loadMilestones, addSystemMessage])

  // Auto-trigger pipeline for draft projects (once only via ref)
  useEffect(() => {
    if (project?.status === "draft" && !pipelineTriggered.current) {
      triggerPipeline()
    }
  }, [project?.status, triggerPipeline])

  // Auto-set active level to the awaiting review level
  useEffect(() => {
    if (awaitingReview) {
      setActiveLevel(awaitingReview as PipelineLevel)
    }
  }, [awaitingReview])

  // Derive completed levels from docs/milestones
  const completedLevels: PipelineLevel[] = []
  if (docs?.vision) completedLevels.push("vision")
  if (milestones && milestones.milestones.length > 0) {
    completedLevels.push("milestones")
    const hasPhases = milestones.milestones.some((m) => m.phases.length > 0)
    if (hasPhases) completedLevels.push("architecture")
    const hasTasks = milestones.milestones.some((m) =>
      m.phases.some((p) => p.tasks.length > 0),
    )
    if (hasTasks) {
      completedLevels.push("design")
      completedLevels.push("tasks")
    }
  }

  // Determine running level based on project status
  const runningLevel: PipelineLevel | null =
    project?.status === "planning" ? "vision" : null

  async function handleArchive() {
    if (!project) return
    await fetch(`/api/projects/${id}`, { method: "DELETE" })
    router.push("/projects")
  }

  async function handleTaskAction(action: string, taskId: string) {
    await fetch(`/api/projects/${id}/milestones`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, taskId }),
    })
    loadMilestones()
  }

  async function handlePhaseAction(action: string, phaseId: string) {
    await fetch(`/api/projects/${id}/milestones`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, phaseId }),
    })
    loadMilestones()
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

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* Center column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push("/projects")}>
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
            <h1 className="text-base font-semibold truncate">{project.name}</h1>
            <StatusBadge status={project.status} />
            {project.workspacePath && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <FolderIcon className="h-3 w-3" />
                {project.workspacePath}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleArchive}>
            <ArchiveIcon className="mr-2 h-4 w-4" />
            Archive
          </Button>
        </div>

        {/* Pipeline nav */}
        <PipelineNav
          activeLevel={activeLevel}
          onSelect={setActiveLevel}
          completedLevels={completedLevels}
          runningLevel={runningLevel}
        />

        {/* Awaiting review banner */}
        {awaitingReview && (
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/50">
            <span className="text-sm text-muted-foreground">
              Review the {awaitingReview} document, then continue when ready.
            </span>
            <Button
              size="sm"
              onClick={() => {
                pipelineTriggered.current = false // Allow re-trigger
                triggerPipeline()
              }}
              disabled={pipelineRunning}
            >
              Continue Pipeline
            </Button>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-auto p-6">
          <ArtifactViewer
            level={activeLevel}
            docs={docs}
            milestones={milestones}
            onTaskAction={handleTaskAction}
            onPhaseAction={handlePhaseAction}
          />
        </div>
      </div>

      {/* Chat panel - always visible */}
      <div className="w-[350px] shrink-0 border-l border-border flex flex-col overflow-hidden">
        <OrchestratorChat projectId={id} systemMessages={systemMessages} />
      </div>
    </div>
  )
}
