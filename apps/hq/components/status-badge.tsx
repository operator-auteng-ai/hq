"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-status-draft/15 text-status-draft border-status-draft/25",
  planning: "bg-status-running/15 text-status-running border-status-running/25",
  building: "bg-status-running/15 text-status-running border-status-running/25",
  deployed: "bg-status-completed/15 text-status-completed border-status-completed/25",
  paused: "bg-status-paused/15 text-status-paused border-status-paused/25",
  archived: "bg-status-draft/15 text-status-draft border-status-draft/25",
  pending: "bg-status-queued/15 text-status-queued border-status-queued/25",
  active: "bg-status-running/15 text-status-running border-status-running/25",
  completed: "bg-status-completed/15 text-status-completed border-status-completed/25",
  failed: "bg-status-failed/15 text-status-failed border-status-failed/25",
  running: "bg-status-running/15 text-status-running border-status-running/25",
  queued: "bg-status-queued/15 text-status-queued border-status-queued/25",
}

export function StatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_STYLES[status] || "", "capitalize", className)}
    >
      {status}
    </Badge>
  )
}
