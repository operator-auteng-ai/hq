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
    <div className="flex items-center gap-0 px-6 py-2 border-b border-border">
      {LEVELS.map((level, i) => {
        const completed = isCompleted(level.key)
        const active = isActive(level.key)
        const running = isRunning(level.key)
        const clickable = isClickable(level.key)

        const prevCompleted = i > 0 && isCompleted(LEVELS[i - 1].key)
        const showConnector = i > 0

        return (
          <div key={level.key} className="flex items-center gap-0 flex-1 first:flex-initial last:flex-initial">
            {showConnector && (
              <div
                className={`h-px flex-1 mx-1 ${
                  prevCompleted && completed
                    ? "bg-[oklch(var(--status-completed))]/50"
                    : "bg-border"
                }`}
              />
            )}
            <button
              type="button"
              onClick={() => clickable && onSelect(level.key)}
              disabled={!clickable}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                active
                  ? "bg-primary/10"
                  : clickable
                    ? "hover:bg-muted/60 cursor-pointer"
                    : "cursor-default opacity-50"
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full shrink-0 ${
                  running
                    ? "bg-[oklch(var(--status-running))] animate-pulse"
                    : active
                      ? "bg-primary ring-2 ring-primary/25"
                      : completed
                        ? "bg-[oklch(var(--status-completed))]"
                        : "bg-muted-foreground/25"
                }`}
              />
              <span
                className={`text-xs whitespace-nowrap ${
                  active
                    ? "font-semibold text-foreground"
                    : completed
                      ? "font-medium text-foreground/80"
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
