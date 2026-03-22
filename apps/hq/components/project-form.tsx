"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2Icon } from "lucide-react"

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try {
    const text = await res.text()
    if (!text) return {}
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export function ProjectForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState("sonnet")
  const [submitting, setSubmitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [error, setError] = useState("")

  const canSubmit = name.trim().length > 0 && prompt.trim().length >= 20

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || submitting) return

    setSubmitting(true)
    setError("")

    try {
      // Step 1: Create project
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), prompt: prompt.trim(), model }),
      })

      const data = await parseJsonSafe(res)

      if (!res.ok) {
        throw new Error(
          (data.error as string) || `Server error (${res.status})`,
        )
      }

      const projectId = data.id as string
      if (!projectId) {
        throw new Error("No project ID returned")
      }

      // Step 2: Trigger planning pipeline via SSE POST
      setGenerating(true)
      setStatusMessage("Starting planning pipeline...")

      const genRes = await fetch(`/api/projects/${projectId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, collaborationProfile: "full_auto" }),
      })

      if (!genRes.ok) {
        // Project was created but planning failed — still redirect
        router.push(`/projects/${projectId}`)
        return
      }

      // Read SSE stream from the POST response
      const reader = genRes.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let done = false
        let currentEvent = ""
        while (!done) {
          const result = await reader.read()
          done = result.done
          if (result.value) {
            const text = decoder.decode(result.value)
            const lines = text.split("\n")
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim()
              } else if (line.startsWith("data: ")) {
                try {
                  const eventData = JSON.parse(line.slice(6))
                  if (currentEvent === "progress") {
                    let msg = `${eventData.level}: ${eventData.status}`
                    if (eventData.detail) msg += ` — ${eventData.detail}`
                    setStatusMessage(msg)
                  } else if (currentEvent === "complete") {
                    setStatusMessage("Done! Redirecting...")
                  } else if (currentEvent === "error") {
                    setError(eventData.error || "Planning failed")
                  }
                } catch {
                  // ignore parse errors in stream
                }
                currentEvent = ""
              }
            }
          }
        }
      }

      router.push(`/projects/${projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setSubmitting(false)
      setGenerating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>New Project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              placeholder="My SaaS Product"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">
              Describe your project
              <span className="ml-1 text-xs text-muted-foreground">
                (min 20 characters)
              </span>
            </Label>
            <Textarea
              id="prompt"
              placeholder="Describe the product you want to build. Include the problem it solves, target users, key features, and any technology preferences..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={submitting}
              rows={8}
              maxLength={10000}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              {prompt.length}/10,000 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">AI Model</Label>
            <Select value={model} onValueChange={setModel} disabled={submitting}>
              <SelectTrigger id="model" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sonnet">Sonnet (balanced)</SelectItem>
                <SelectItem value="opus">Opus (highest quality)</SelectItem>
                <SelectItem value="haiku">Haiku (fastest)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {generating && statusMessage && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              {statusMessage}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  {generating ? "Planning..." : "Creating..."}
                </>
              ) : (
                "Create Project"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/projects")}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
