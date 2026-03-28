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

    case "milestones":
      if (docs?.milestones) {
        return <MarkdownContent content={docs.milestones} />
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
      return <Placeholder text="Milestones will appear when the pipeline completes." />

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
