"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { PipelineLevel } from "@/components/pipeline-nav"
import { MilestoneTree, type MilestoneTreeData } from "@/components/milestone-tree"
import { StatusBadge } from "@/components/status-badge"

export interface DocFile {
  path: string
  content: string
}

export interface ProjectDocs {
  vision: string | null
  milestones: string | null
  arch: string | null
  plan: string | null
  taxonomy: string | null
  codingStandards: string | null
  archDeltas: DocFile[]
  designDocs: DocFile[]
}

export interface ArtifactViewerProps {
  level: PipelineLevel
  docs: ProjectDocs | null
  milestones: MilestoneTreeData | null
  onTaskAction: (action: string, taskId: string) => void
  onPhaseAction: (action: string, phaseId: string) => void
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Render code blocks as pre with overflow
          pre: ({ children, ...props }) => (
            <pre className="overflow-auto rounded-lg bg-muted p-4 text-sm" {...props}>
              {children}
            </pre>
          ),
          // Style tables
          table: ({ children, ...props }) => (
            <table className="border-collapse text-sm" {...props}>
              {children}
            </table>
          ),
          th: ({ children, ...props }) => (
            <th className="border border-border px-3 py-1.5 bg-muted text-left font-medium" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-border px-3 py-1.5" {...props}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function Placeholder({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
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
    default:
      return "bg-muted-foreground/30"
  }
}

function ArchSubNav({
  archDeltas,
  canonicalArch,
  selected,
  onSelect,
}: {
  archDeltas: DocFile[]
  canonicalArch: string | null
  selected: string
  onSelect: (key: string) => void
}) {
  if (archDeltas.length === 0 && !canonicalArch) return null

  return (
    <div className="flex flex-wrap gap-1 pb-4 border-b border-border mb-4">
      {canonicalArch && (
        <button
          type="button"
          onClick={() => onSelect("canonical")}
          className={`text-sm px-3 py-1 rounded-md transition-colors ${
            selected === "canonical"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          Canonical ARCH.md
        </button>
      )}
      {archDeltas.map((delta) => {
        // Extract milestone name from path like "milestones/M1-core-invoicing/ARCH.md"
        const parts = delta.path.split("/")
        const milestonePart = parts.find((p) => p.startsWith("M") || parts.indexOf(p) === parts.length - 2)
        const label = milestonePart ?? delta.path

        return (
          <button
            key={delta.path}
            type="button"
            onClick={() => onSelect(delta.path)}
            className={`text-sm px-3 py-1 rounded-md transition-colors ${
              selected === delta.path
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function DesignSubNav({
  designDocs,
  selected,
  onSelect,
}: {
  designDocs: DocFile[]
  selected: string
  onSelect: (path: string) => void
}) {
  if (designDocs.length === 0) return null

  // Group by parent directory (phase)
  const groups = new Map<string, DocFile[]>()
  for (const doc of designDocs) {
    const parts = doc.path.split("/")
    // e.g. "detailed_design/phase-name/component.md" → "phase-name"
    const phase = parts.length >= 2 ? parts[parts.length - 2] : "other"
    const existing = groups.get(phase) ?? []
    existing.push(doc)
    groups.set(phase, existing)
  }

  return (
    <div className="pb-4 border-b border-border mb-4 space-y-2">
      {Array.from(groups.entries()).map(([phase, docs]) => (
        <div key={phase}>
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            {phase.replace(/-/g, " ")}
          </p>
          <div className="flex flex-wrap gap-1">
            {docs.map((doc) => {
              const filename = doc.path.split("/").pop() ?? doc.path
              return (
                <button
                  key={doc.path}
                  type="button"
                  onClick={() => onSelect(doc.path)}
                  className={`text-sm px-3 py-1 rounded-md transition-colors ${
                    selected === doc.path
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {filename}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ArtifactViewer({
  level,
  docs,
  milestones,
  onTaskAction,
  onPhaseAction,
}: ArtifactViewerProps) {
  const [archSelection, setArchSelection] = useState("canonical")
  const [designSelection, setDesignSelection] = useState("")

  switch (level) {
    case "vision":
      if (docs?.vision) {
        return <MarkdownContent content={docs.vision} />
      }
      return <Placeholder text="Planning pipeline will generate VISION.md..." />

    case "milestones": {
      if (milestones && milestones.milestones.length > 0) {
        // Find the MVP boundary index
        const mvpIdx = milestones.milestones.findIndex((m) => m.isMvpBoundary === 1)

        return (
          <div className="space-y-3">
            {/* Progress summary */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground pb-2">
              <span>{milestones.progress.completedMilestones}/{milestones.progress.totalMilestones} milestones</span>
              <span>{milestones.progress.completedTasks}/{milestones.progress.totalTasks} tasks</span>
            </div>

            {milestones.milestones.map((m, i) => {
              const desc = m.description ?? undefined
              const completedTasks = m.phases.reduce(
                (sum, p) => sum + p.tasks.filter((t) => t.status === "completed").length, 0,
              )
              const totalTasks = m.phases.reduce((sum, p) => sum + p.tasks.length, 0)
              const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

              return (
                <div key={m.id}>
                  {/* MVP boundary divider */}
                  {mvpIdx >= 0 && i === mvpIdx + 1 && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Post-MVP</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className="rounded-lg border border-border bg-card/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${statusDotClass(m.status)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{m.name}</span>
                          <StatusBadge status={m.status} />
                          {m.isMvpBoundary === 1 && (
                            <span className="text-xs font-medium text-[oklch(var(--status-paused))] border border-[oklch(var(--status-paused))]/30 rounded px-1.5 py-0.5">
                              MVP
                            </span>
                          )}
                        </div>
                        {desc && (
                          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{desc}</p>
                        )}
                        {totalTasks > 0 && (
                          <div className="flex items-center gap-3 mt-3">
                            <div className="h-1.5 flex-1 max-w-48 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-[oklch(var(--status-completed))] rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{completedTasks}/{totalTasks} tasks</span>
                          </div>
                        )}
                        {m.phases.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {m.phases.map((p) => (
                              <span
                                key={p.id}
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-0.5"
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(p.status)}`} />
                                {p.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      }

      // Fallback: show raw markdown if no structured data yet
      if (docs?.milestones) {
        return <MarkdownContent content={docs.milestones} />
      }
      return <Placeholder text="Milestones will appear when the pipeline completes." />
    }

    case "architecture": {
      const archDeltas = docs?.archDeltas ?? []
      const canonicalArch = docs?.arch ?? null

      // Determine which content to show
      let content: string | null = null
      if (archSelection === "canonical") {
        content = canonicalArch
      } else {
        const delta = archDeltas.find((d) => d.path === archSelection)
        content = delta?.content ?? null
      }

      // If nothing is selected yet but there are deltas, default to canonical
      if (!content && archDeltas.length === 0 && canonicalArch) {
        content = canonicalArch
      }

      return (
        <div>
          <ArchSubNav
            archDeltas={archDeltas}
            canonicalArch={canonicalArch}
            selected={archSelection}
            onSelect={setArchSelection}
          />
          {content ? (
            <MarkdownContent content={content} />
          ) : (
            <Placeholder text="Planning pipeline will generate architecture docs..." />
          )}
        </div>
      )
    }

    case "design": {
      const designDocs = docs?.designDocs ?? []

      // Auto-select first doc if nothing selected
      const effectiveSelection = designSelection || (designDocs.length > 0 ? designDocs[0].path : "")
      const selectedDoc = designDocs.find((d) => d.path === effectiveSelection)

      if (designDocs.length > 0) {
        return (
          <div>
            <DesignSubNav
              designDocs={designDocs}
              selected={effectiveSelection}
              onSelect={setDesignSelection}
            />
            {selectedDoc ? (
              <MarkdownContent content={selectedDoc.content} />
            ) : (
              <Placeholder text="Select a design document." />
            )}
          </div>
        )
      }

      // Fallback: show taxonomy/coding standards if no design docs yet
      if (docs?.taxonomy || docs?.codingStandards) {
        return (
          <div className="space-y-6">
            {docs.taxonomy && (
              <div>
                <h3 className="text-base font-medium mb-2">TAXONOMY.md</h3>
                <MarkdownContent content={docs.taxonomy} />
              </div>
            )}
            {docs.codingStandards && (
              <div>
                <h3 className="text-base font-medium mb-2">CODING_STANDARDS.md</h3>
                <MarkdownContent content={docs.codingStandards} />
              </div>
            )}
          </div>
        )
      }
      return <Placeholder text="Planning pipeline will generate design docs..." />
    }

    case "tasks":
      if (milestones && milestones.milestones.length > 0) {
        return (
          <MilestoneTree
            data={milestones}
            onTaskAction={onTaskAction}
            onPhaseAction={onPhaseAction}
          />
        )
      }
      return <Placeholder text="Milestones will appear when the pipeline completes." />

    default:
      return null
  }
}
