"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SendIcon, Loader2Icon, ZapIcon } from "lucide-react"
import { SystemMessage, type SystemMessageData } from "@/components/system-message"

interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  icon?: string | null
  actionProposed?: string | null
  actionExecuted?: number
  createdAt: string
}

interface ProposedAction {
  action: string
  entityId: string
  description: string
}

export interface OrchestratorChatProps {
  projectId: string
  systemMessages?: SystemMessageData[]
}

type TimelineItem =
  | { kind: "chat"; message: ChatMessage }
  | { kind: "system"; message: SystemMessageData }

export function OrchestratorChat({ projectId, systemMessages = [] }: OrchestratorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const [pendingActions, setPendingActions] = useState<{
    messageId: string
    actions: ProposedAction[]
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  // Merge chat messages and system messages into a chronological timeline
  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = []
    const dbSystemContents = new Set<string>()

    for (const m of messages) {
      if (m.role === "system") {
        dbSystemContents.add(m.content)
        items.push({
          kind: "system",
          message: {
            id: m.id,
            role: "system",
            content: m.content,
            icon: (m.icon as SystemMessageData["icon"]) ?? "info",
            timestamp: m.createdAt,
          },
        })
      } else {
        items.push({ kind: "chat", message: m })
      }
    }

    // Add live system messages that aren't already persisted in DB
    for (const sm of systemMessages) {
      if (!dbSystemContents.has(sm.content)) {
        items.push({ kind: "system", message: sm })
      }
    }

    items.sort((a, b) => {
      const aTime = a.kind === "chat" ? a.message.createdAt : a.message.timestamp
      const bTime = b.kind === "chat" ? b.message.createdAt : b.message.timestamp
      return aTime.localeCompare(bTime)
    })
    return items
  }, [messages, systemMessages])

  useEffect(() => {
    scrollToBottom()
  }, [timeline, streamingContent, scrollToBottom])

  // Load chat history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/projects/${projectId}/chat`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages ?? [])
        }
      } catch {
        // ignore load errors
      }
    }
    loadHistory()
  }, [projectId])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return

    setInput("")
    setSending(true)
    setStreamingContent("")
    setPendingActions(null)

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const error = (data as Record<string, unknown>).error ?? `Error ${res.status}`
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `Error: ${error}`,
            createdAt: new Date().toISOString(),
          },
        ])
        setSending(false)
        return
      }

      // Stream the response
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""
      let assistantMessageId = ""
      const collectedActions: ProposedAction[] = []

      if (reader) {
        let done = false
        let currentEvent = ""

        while (!done) {
          const result = await reader.read()
          done = result.done
          if (result.value) {
            const chunk = decoder.decode(result.value, { stream: true })
            const lines = chunk.split("\n")

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim()
                continue
              }

              if (!line.startsWith("data: ")) continue

              try {
                const data = JSON.parse(line.slice(6))

                switch (currentEvent) {
                  case "token":
                    accumulated += data.content ?? ""
                    setStreamingContent(accumulated)
                    break

                  case "action":
                    collectedActions.push(data as ProposedAction)
                    break

                  case "done":
                    assistantMessageId = data.messageId ?? ""
                    break

                  case "error":
                    accumulated += `\n\nError: ${data.error}`
                    setStreamingContent(accumulated)
                    break
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      }

      // Finalize: add assistant message to state
      const assistantMsg: ChatMessage = {
        id: assistantMessageId || `assistant-${Date.now()}`,
        role: "assistant",
        content: accumulated,
        actionProposed:
          collectedActions.length > 0
            ? JSON.stringify(collectedActions)
            : null,
        actionExecuted: 0,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamingContent("")

      if (collectedActions.length > 0 && assistantMessageId) {
        setPendingActions({
          messageId: assistantMessageId,
          actions: collectedActions,
        })
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Failed to send message. Check your connection.",
          createdAt: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  async function handleConfirmAction(confirm: boolean) {
    if (!pendingActions) return

    try {
      const res = await fetch(`/api/projects/${projectId}/chat/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: pendingActions.messageId,
          confirm,
        }),
      })

      if (res.ok && confirm) {
        // Update the message to show action was executed
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingActions.messageId
              ? { ...m, actionExecuted: 1 }
              : m,
          ),
        )
      }
    } catch {
      // ignore confirm errors
    } finally {
      setPendingActions(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground">Orchestrator Chat</span>
      </div>

      {/* Messages - scrollable, fills space */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {timeline.length === 0 && !streamingContent && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Chat with the orchestrator about this project.
          </p>
        )}

        {timeline.map((item) => {
          if (item.kind === "system") {
            return <SystemMessage key={item.message.id} message={item.message} />
          }

          const msg = item.message
          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className="text-xs mt-1 opacity-60">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </p>
                {msg.actionProposed && msg.actionExecuted === 1 && (
                  <p className="text-xs mt-1 opacity-60">Action executed</p>
                )}
              </div>
            </div>
          )
        })}

        {/* Streaming content */}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg p-3 bg-muted">
              <p className="text-sm whitespace-pre-wrap">{streamingContent}</p>
            </div>
          </div>
        )}

        {/* Action confirmation card */}
        {pendingActions && (
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <ZapIcon className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Proposed Action</span>
            </div>
            {pendingActions.actions.map((action, i) => (
              <p key={i} className="text-sm text-muted-foreground mb-2">
                {action.description}
              </p>
            ))}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleConfirmAction(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleConfirmAction(true)}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Input - fixed at bottom */}
      <div className="border-t border-border p-3 flex gap-2 shrink-0">
        <Input
          placeholder="Ask about project status, propose actions..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          className="text-sm"
        />
        <Button
          size="icon"
          aria-label="Send message"
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <SendIcon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
