"use client"

import { useEffect, useState, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { PipelineNav, type PipelineLevel } from "@/components/pipeline-nav"
import { MilestoneTree, type MilestoneTreeData } from "@/components/milestone-tree"
import { OrchestratorChat } from "@/components/orchestrator-chat"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeftIcon, ArchiveIcon, FolderIcon } from "lucide-react"

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

interface ProjectDocs {
  vision: string | null
  milestones: string | null
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
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<ProjectDocs | null>(null)
  const [milestones, setMilestones] = useState<MilestoneTreeData | null>(null)
  const [activeLevel, setActiveLevel] = useState<PipelineLevel>("vision")
  const [pipelineStarted, setPipelineStarted] = useState(false)

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

  // Auto-trigger pipeline for draft projects
  useEffect(() => {
    if (project?.status === "draft" && !pipelineStarted) {
      setPipelineStarted(true)
      fetch(`/api/projects/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "sonnet", collaborationProfile: "full_auto" }),
      }).then(() => {
        // Reload project to get updated status and workspace path
        loadProject()
      }).catch(() => {
        // Pipeline trigger failed, user can retry via chat
      })
    }
  }, [project?.status, pipelineStarted, id, loadProject])

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

  function renderContent() {
    switch (activeLevel) {
      case "vision":
        if (docs?.vision) {
          return (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {docs.vision}
            </pre>
          )
        }
        return (
          <p className="text-sm text-muted-foreground">
            Planning pipeline will generate documents...
          </p>
        )

      case "milestones":
        if (docs?.milestones) {
          return (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {docs.milestones}
            </pre>
          )
        }
        if (milestones && milestones.milestones.length > 0) {
          return (
            <div className="space-y-2">
              {milestones.milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <StatusBadge status={m.status} />
                  <span className="text-sm">{m.name}</span>
                  {m.isMvpBoundary === 1 && (
                    <span className="text-xs text-muted-foreground">&larr; MVP</span>
                  )}
                </div>
              ))}
            </div>
          )
        }
        return (
          <p className="text-sm text-muted-foreground">
            Milestones will appear when the pipeline completes.
          </p>
        )

      case "architecture":
        if (docs?.arch) {
          return (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {docs.arch}
            </pre>
          )
        }
        return (
          <p className="text-sm text-muted-foreground">
            Planning pipeline will generate documents...
          </p>
        )

      case "design":
        if (docs?.codingStandards || docs?.taxonomy) {
          return (
            <div className="space-y-6">
              {docs.taxonomy && (
                <div>
                  <h3 className="text-base font-medium mb-2">TAXONOMY.md</h3>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                    {docs.taxonomy}
                  </pre>
                </div>
              )}
              {docs.codingStandards && (
                <div>
                  <h3 className="text-base font-medium mb-2">CODING-STANDARDS.md</h3>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                    {docs.codingStandards}
                  </pre>
                </div>
              )}
            </div>
          )
        }
        return (
          <p className="text-sm text-muted-foreground">
            Planning pipeline will generate documents...
          </p>
        )

      case "tasks":
        if (milestones && milestones.milestones.length > 0) {
          return (
            <MilestoneTree
              data={milestones}
              onTaskAction={handleTaskAction}
              onPhaseAction={handlePhaseAction}
            />
          )
        }
        return (
          <p className="text-sm text-muted-foreground">
            Milestones will appear when the pipeline completes.
          </p>
        )

      default:
        return null
    }
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
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
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

        {/* Content area */}
        <div className="flex-1 overflow-auto p-6">
          {renderContent()}
        </div>
      </div>

      {/* Chat panel - always visible */}
      <div className="w-[350px] shrink-0 border-l border-border flex flex-col overflow-hidden">
        <OrchestratorChat projectId={id} />
      </div>
    </div>
  )
}
