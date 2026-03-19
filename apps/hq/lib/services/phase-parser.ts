export type PhaseStatus = "pending" | "active" | "review" | "completed" | "failed"

export interface ParsedPhase {
  phaseNumber: number
  name: string
  description: string | null
  exitCriteria: string | null
  status: PhaseStatus
}

const PHASE_HEADING_RE = /^###\s+Phase\s+(\d+)\s*[:\s—–-]+\s*(.+)/

export function parsePhasesFromPlan(planMarkdown: string): ParsedPhase[] {
  const lines = planMarkdown.split("\n")
  const phases: ParsedPhase[] = []

  let currentPhase: ParsedPhase | null = null
  let section: "body" | "exit-criteria" | null = null
  let exitLines: string[] = []

  function flushPhase() {
    if (currentPhase) {
      if (exitLines.length > 0) {
        currentPhase.exitCriteria = exitLines.join("\n")
      }
      phases.push(currentPhase)
    }
    currentPhase = null
    section = null
    exitLines = []
  }

  for (const line of lines) {
    // Check for new phase heading
    const match = line.match(PHASE_HEADING_RE)
    if (match) {
      flushPhase()
      currentPhase = {
        phaseNumber: parseInt(match[1], 10),
        name: match[2].trim(),
        description: null,
        exitCriteria: null,
        status: "pending",
      }
      section = "body"
      continue
    }

    // Check for next ## or ### heading (end of current phase)
    if (currentPhase && /^#{2,3}\s/.test(line) && !line.match(PHASE_HEADING_RE)) {
      flushPhase()
      continue
    }

    if (!currentPhase) continue

    // Check for From/To description
    if (line.startsWith("**From**:") || line.startsWith("**From**:")) {
      const desc = currentPhase.description ? currentPhase.description + "\n" : ""
      currentPhase.description = desc + line.replace(/\*\*/g, "").trim()
      continue
    }
    if (line.startsWith("**To**:") || line.startsWith("**To**:")) {
      const desc = currentPhase.description ? currentPhase.description + "\n" : ""
      currentPhase.description = desc + line.replace(/\*\*/g, "").trim()
      continue
    }

    // Check for exit criteria section
    if (/^\*\*Exit Criteria\*\*/.test(line)) {
      section = "exit-criteria"
      continue
    }

    // Collect exit criteria bullet points
    if (section === "exit-criteria" && line.startsWith("- ")) {
      exitLines.push(line.slice(2).trim())
    }
  }

  flushPhase()
  return phases
}

export function parsePhaseStatus(progressLog: string, phaseNumber: number): PhaseStatus {
  // Look for phase status indicators in the progress log
  // Common patterns: "Phase N completed", "Phase N: active", "Phase N failed"
  const lines = progressLog.split("\n")

  let latestStatus: PhaseStatus = "pending"

  for (const line of lines) {
    const lower = line.toLowerCase()
    if (!lower.includes(`phase ${phaseNumber}`) && !lower.includes(`phase${phaseNumber}`)) {
      continue
    }

    if (lower.includes("completed") || lower.includes("complete") || lower.includes("✅")) {
      latestStatus = "completed"
    } else if (lower.includes("failed") || lower.includes("failure")) {
      latestStatus = "failed"
    } else if (lower.includes("review") || lower.includes("approval")) {
      latestStatus = "review"
    } else if (lower.includes("active") || lower.includes("started") || lower.includes("in progress")) {
      latestStatus = "active"
    }
  }

  return latestStatus
}
