"use client"

export type PipelineLevel = "vision" | "milestones" | "architecture" | "design" | "tasks"

export interface PipelineNavProps {
  activeLevel: PipelineLevel
  onSelect: (level: PipelineLevel) => void
  completedLevels: PipelineLevel[]
  runningLevel?: PipelineLevel | null
}

const LEVELS: { key: PipelineLevel; label: string }[] = [
  { key: "vision", label: "Vision" },
  { key: "milestones", label: "Milestones" },
  { key: "architecture", label: "Architecture" },
  { key: "design", label: "Design" },
  { key: "tasks", label: "Tasks" },
]

export function PipelineNav({
  activeLevel,
  onSelect,
  completedLevels,
  runningLevel,
}: PipelineNavProps) {
  const isCompleted = (level: PipelineLevel) => completedLevels.includes(level)
  const isActive = (level: PipelineLevel) => activeLevel === level
  const isRunning = (level: PipelineLevel) => runningLevel === level
  const isClickable = (level: PipelineLevel) => isCompleted(level) || isActive(level)

  return (
    <div className="flex items-center gap-1 px-6 py-3 border-b border-border">
      {LEVELS.map((level, i) => {
        const completed = isCompleted(level.key)
        const active = isActive(level.key)
        const running = isRunning(level.key)
        const clickable = isClickable(level.key)

        const prevCompleted = i > 0 && isCompleted(LEVELS[i - 1].key)
        const showConnector = i > 0

        return (
          <div key={level.key} className="flex items-center gap-1 flex-1 first:flex-initial last:flex-initial">
            {showConnector && (
              <div
                className={`h-px flex-1 ${
                  prevCompleted && completed
                    ? "bg-[oklch(var(--status-completed))]"
                    : "bg-border"
                }`}
              />
            )}
            <button
              type="button"
              onClick={() => clickable && onSelect(level.key)}
              disabled={!clickable}
              className={`flex flex-col items-center gap-1 ${
                clickable ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <div
                className={`h-3 w-3 rounded-full ${
                  running
                    ? "bg-[oklch(var(--status-running))] animate-pulse"
                    : active
                      ? "bg-primary ring-2 ring-primary/30"
                      : completed
                        ? "bg-[oklch(var(--status-completed))]"
                        : "bg-muted-foreground/30"
                }`}
              />
              <span
                className={`text-xs ${
                  active
                    ? "font-semibold text-foreground"
                    : completed
                      ? "font-medium text-foreground"
                      : "font-medium text-muted-foreground"
                }`}
              >
                {level.label}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
