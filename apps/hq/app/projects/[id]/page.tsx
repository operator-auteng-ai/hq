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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ArchiveIcon, FolderIcon, SettingsIcon } from "lucide-react"

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

/**
 * Maps a planningStep value to the pipeline level that just completed
 * and is awaiting review. planningStep stores the *next* step to run,
 * so we return the level that precedes it.
 */
function stepToReviewLevel(step: string | null): PipelineLevel | null {
  if (!step || step === "init" || step === "complete") return null
  if (step === "milestones") return "vision"
  if (step.startsWith("architecture")) return "milestones"
  if (step.startsWith("design")) return "architecture"
  // If step is "vision", pipeline hasn't completed vision yet — no review
  return null
}

/**
 * Determines the best active pipeline level to show based on project state.
 */
function deriveActiveLevel(
  step: string | null,
  status: string,
  completedLevels: PipelineLevel[],
): PipelineLevel {
  // If awaiting review, show the completed level
  const reviewLevel = stepToReviewLevel(step)
  if (status === "planning" && reviewLevel) return reviewLevel

  // Show the highest completed level, or vision as fallback
  if (completedLevels.length > 0) {
    return completedLevels[completedLevels.length - 1]
  }
  return "vision"
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

function mapProgressToContent(level: string, status: string, detail?: string, error?: string): string {
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1)
  if (status === "failed" && error) return `${levelLabel} failed: ${error}`
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
  const initialStateApplied = useRef(false)

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

  // Reconstruct gate/level state from DB on initial load
  useEffect(() => {
    if (!project || initialStateApplied.current) return
    initialStateApplied.current = true

    // Derive awaiting review from planningStep
    const reviewLevel = stepToReviewLevel(project.planningStep)
    if (project.status === "planning" && reviewLevel) {
      setAwaitingReview(reviewLevel)
      // Pipeline is paused, not actively running
      setPipelineRunning(false)
      pipelineTriggered.current = true // Prevent auto-trigger
    }

    // If project already has a planningStep, it's been triggered before
    if (project.planningStep && project.planningStep !== "init") {
      pipelineTriggered.current = true
    }
  }, [project])

  // Derive active level once docs/milestones load (only on initial load)
  const initialLevelSet = useRef(false)
  useEffect(() => {
    if (!project || !docs || initialLevelSet.current) return
    // Wait until we have docs so completedLevels is accurate
    const completed: PipelineLevel[] = []
    if (docs.vision) completed.push("vision")
    // milestones may still be loading, but we can set a reasonable default
    if (milestones && milestones.milestones.length > 0) {
      completed.push("milestones")
      if (milestones.milestones.some((m) => m.phases.length > 0)) completed.push("architecture")
      if (milestones.milestones.some((m) => m.phases.some((p) => p.tasks.length > 0))) {
        completed.push("design")
        completed.push("tasks")
      }
    }
    const derived = deriveActiveLevel(project.planningStep, project.status, completed)
    setActiveLevel(derived)
    initialLevelSet.current = true
  }, [project, docs, milestones])

  // Poll milestones every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      loadMilestones()
    }, 5000)
    return () => clearInterval(interval)
  }, [loadMilestones])

  // Trigger pipeline for draft projects (once only via ref)
  // Guard: only auto-trigger if status is draft AND pipeline hasn't started
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
                      mapProgressToContent(data.level, data.status, data.detail, data.error),
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

  // Auto-trigger pipeline for draft projects that haven't started planning
  useEffect(() => {
    if (
      project?.status === "draft" &&
      !project.planningStep &&
      !pipelineTriggered.current
    ) {
      triggerPipeline()
    }
  }, [project?.status, project?.planningStep, triggerPipeline])

  // Auto-set active level to the awaiting review level (from SSE events)
  useEffect(() => {
    if (awaitingReview && initialLevelSet.current) {
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

  // Determine running level based on project status and pipeline state
  const runningLevel: PipelineLevel | null =
    (project?.status === "planning" && pipelineRunning) ? "vision" : null

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
    <div className="-mx-6 -mb-6 -mt-14 relative z-20 flex h-screen overflow-hidden" data-owns-sidebar-trigger>
      {/* Center column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <SidebarTrigger className="shrink-0" />
            <h1 className="text-lg font-semibold truncate">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {project.workspacePath && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1">
                <FolderIcon className="h-3 w-3" />
                <span className="max-w-[200px] truncate">{project.workspacePath}</span>
              </span>
            )}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <SettingsIcon className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Project Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <p className="text-sm text-muted-foreground">{project.name}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <div><StatusBadge status={project.status} /></div>
                  </div>
                  {project.workspacePath && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Workspace</label>
                      <p className="text-sm text-muted-foreground font-mono">{project.workspacePath}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Created</label>
                    <p className="text-sm text-muted-foreground">
                      {new Date(project.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
                    <p className="text-sm text-muted-foreground">
                      Archiving a project removes it from your active list. This action can be undone.
                    </p>
                    <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleArchive}>
                      <ArchiveIcon className="mr-2 h-4 w-4" />
                      Archive Project
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Pipeline nav */}
        <PipelineNav
          activeLevel={activeLevel}
          onSelect={setActiveLevel}
          completedLevels={completedLevels}
          runningLevel={runningLevel}
        />

        {/* Content area */}
        <div className="flex-1 overflow-auto p-6">
          {/* Awaiting review task */}
          {awaitingReview && (
            <div className="mb-6 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <span className="h-5 w-5 rounded border-2 border-primary/40 shrink-0" />
              <span className="text-sm text-foreground/80 flex-1">
                Review the <span className="font-medium">{awaitingReview}</span> document, then continue when ready.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  pipelineTriggered.current = false
                  triggerPipeline()
                }}
                disabled={pipelineRunning}
              >
                Continue Pipeline
              </Button>
            </div>
          )}
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
      <div className="w-[350px] shrink-0 border-l border-border bg-card/30 flex flex-col overflow-hidden">
        <OrchestratorChat projectId={id} systemMessages={systemMessages} />
      </div>
    </div>
  )
}
