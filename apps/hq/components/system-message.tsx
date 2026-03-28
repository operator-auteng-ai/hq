"use client"

import { Loader2Icon, CheckCircle2Icon, XCircleIcon, InfoIcon } from "lucide-react"

export interface SystemMessageData {
  id: string
  role: "system"
  content: string
  icon: "running" | "completed" | "failed" | "info"
  timestamp: string
}

const iconMap = {
  running: Loader2Icon,
  completed: CheckCircle2Icon,
  failed: XCircleIcon,
  info: InfoIcon,
} as const

const iconClassMap = {
  running: "text-[oklch(var(--status-running))] animate-spin",
  completed: "text-[oklch(var(--status-completed))]",
  failed: "text-[oklch(var(--status-failed))]",
  info: "text-muted-foreground",
} as const

export function SystemMessage({ message }: { message: SystemMessageData }) {
  const Icon = iconMap[message.icon]
  const iconClass = iconClassMap[message.icon]

  return (
    <div className="flex items-center gap-2 py-1 px-3">
      <Icon className={`h-3 w-3 shrink-0 ${iconClass}`} />
      <span className="text-xs text-muted-foreground flex-1">{message.content}</span>
      <span className="text-xs text-muted-foreground/50 shrink-0">
        {new Date(message.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  )
}
