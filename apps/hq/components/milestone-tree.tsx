"use client"

import { useState } from "react"
import { ChevronRightIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface MilestoneTreeData {
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

export interface MilestoneTreeProps {
  data: MilestoneTreeData
  onTaskAction?: (action: string, taskId: string) => void
  onPhaseAction?: (action: string, phaseId: string) => void
}

function statusDotClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-[oklch(var(--status-completed))]"
    case "active":
    case "in_progress":
      return "bg-[oklch(var(--status-running))]"
    case "pending":
      return "bg-muted-foreground/30"
    case "failed":
      return "bg-[oklch(var(--status-failed))]"
    case "reviewing":
      return "bg-[oklch(var(--status-paused))]"
    case "skipped":
      return "bg-muted-foreground/20"
    default:
      return "bg-muted-foreground/30"
  }
}

export function MilestoneTree({ data, onTaskAction, onPhaseAction }: MilestoneTreeProps) {
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(new Set())
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())

  const toggleMilestone = (id: string) => {
    setExpandedMilestones((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const togglePhase = (id: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const { progress } = data

  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground pb-2">
        {progress.completedMilestones}/{progress.totalMilestones} milestones, {progress.completedTasks}/{progress.totalTasks} tasks
      </div>

      {data.milestones.map((milestone) => {
        const milestoneExpanded = expandedMilestones.has(milestone.id)
        const completedTasks = milestone.phases.reduce(
          (sum, p) => sum + p.tasks.filter((t) => t.status === "completed").length,
          0
        )
        const totalTasks = milestone.phases.reduce((sum, p) => sum + p.tasks.length, 0)
        const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

        return (
          <div key={milestone.id}>
            <div
              className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
              onClick={() => toggleMilestone(milestone.id)}
            >
              {milestoneExpanded ? (
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDotClass(milestone.status)}`} />
              <span className="text-sm font-medium flex-1">{milestone.name}</span>
              {milestone.isMvpBoundary === 1 && (
                <span className="text-xs font-medium text-[oklch(var(--status-paused))] border border-[oklch(var(--status-paused))]/30 rounded px-1.5 py-0.5">
                  MVP
                </span>
              )}
              <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-[oklch(var(--status-completed))] rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {milestoneExpanded &&
              milestone.phases.map((phase) => {
                const phaseExpanded = expandedPhases.has(phase.id)

                return (
                  <div key={phase.id} className="ml-6">
                    <div
                      className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => togglePhase(phase.id)}
                    >
                      {phaseExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDotClass(phase.status)}`} />
                      <span className="text-sm flex-1">{phase.name}</span>
                      {(phase.status === "reviewing" || phase.status === "review_failed") && onPhaseAction && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-6 px-2"
                            onClick={(e) => {
                              e.stopPropagation()
                              onPhaseAction("approvePhase", phase.id)
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-6 px-2"
                            onClick={(e) => {
                              e.stopPropagation()
                              onPhaseAction("rejectPhase", phase.id)
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>

                    {phaseExpanded &&
                      phase.tasks.map((task) => (
                        <div key={task.id} className="ml-6 flex items-center gap-2 py-1 px-1">
                          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDotClass(task.status)}`} />
                          <span className="text-sm flex-1">{task.title}</span>
                          {onTaskAction && (
                            <div className="flex gap-1">
                              {task.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-6 px-2"
                                  onClick={() => onTaskAction("startTask", task.id)}
                                >
                                  Start
                                </Button>
                              )}
                              {task.status === "failed" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-6 px-2"
                                  onClick={() => onTaskAction("retryTask", task.id)}
                                >
                                  Retry
                                </Button>
                              )}
                              {(task.status === "pending" || task.status === "failed") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-6 px-2"
                                  onClick={() => onTaskAction("skipTask", task.id)}
                                >
                                  Skip
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}
