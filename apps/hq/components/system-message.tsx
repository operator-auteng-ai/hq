"use client"

import { Loader2Icon, CheckCircle2Icon, XCircleIcon, InfoIcon } from "lucide-react"

export interface SystemMessageProps {
  content: string
  icon: "running" | "completed" | "failed" | "info"
  timestamp: string
}

export function SystemMessage({ content, icon, timestamp }: SystemMessageProps) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3">
      {icon === "running" && <Loader2Icon className="h-3 w-3 shrink-0 text-[oklch(var(--status-running))] animate-spin" />}
      {icon === "completed" && <CheckCircle2Icon className="h-3 w-3 shrink-0 text-[oklch(var(--status-completed))]" />}
      {icon === "failed" && <XCircleIcon className="h-3 w-3 shrink-0 text-[oklch(var(--status-failed))]" />}
      {icon === "info" && <InfoIcon className="h-3 w-3 shrink-0 text-muted-foreground" />}
      <span className="text-xs text-muted-foreground flex-1">{content}</span>
      <span className="text-xs text-muted-foreground/50 shrink-0">
        {new Date(timestamp).toLocaleTimeString()}
      </span>
    </div>
  )
}
