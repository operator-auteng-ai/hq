import { describe, it, expect } from "vitest"
import { parsePhasesFromPlan, parsePhaseStatus } from "./phase-parser"

const REAL_PLAN = `# Development Plan: Balanced Gut

## Current State

**Starting Point**: Project initialization

## Version v0 (MVP) Development Plan

### Phase 1: Core Infrastructure Setup
**From**: Empty repository
**To**: Working Electron application with basic database and file management

| Task | Description | Effort |
|------|-------------|--------|
| Initialize Electron-React-TypeScript project | Set up build toolchain | 2 days |
| Implement SQLite database layer | Create SQLCipher integration | 3 days |
| Build file system manager | Create secure local storage | 2 days |

**Exit Criteria**:
- Application launches successfully on all target platforms
- SQLite database creates and migrates tables correctly
- File uploads work and store encrypted files locally
- Basic navigation between dashboard and settings works

### Phase 2: Manual Test Data Entry
**From**: Basic infrastructure
**To**: Functional test result entry and basic data visualization

| Task | Description | Effort |
|------|-------------|--------|
| Design TestResult data models | Implement complete schema | 2 days |
| Build manual test entry forms | Create multi-step wizard | 4 days |

**Exit Criteria**:
- Users can manually enter complete SIBO breath test results
- Users can manually enter comprehensive stool analysis results
- Test results display in organized list

### Phase 3: PDF Import and Processing
**From**: Manual entry system
**To**: Automated PDF parsing with fallback to manual entry

| Task | Description | Effort |
|------|-------------|--------|
| Integrate PDF parsing libraries | Set up PDF-parse | 2 days |
| Build Genova Diagnostics parser | Create structured extraction | 3 days |

**Exit Criteria**:
- PDF uploads automatically extract biomarker data
- Parsing confidence scores help users identify data requiring review

## Phase Dependencies

\`\`\`mermaid
graph TD
    P1[Phase 1] --> P2[Phase 2]
    P2 --> P3[Phase 3]
\`\`\`
`

describe("parsePhasesFromPlan", () => {
  it("parses real PLAN.md format with 3 phases", () => {
    const phases = parsePhasesFromPlan(REAL_PLAN)
    expect(phases).toHaveLength(3)
  })

  it("extracts phase numbers correctly", () => {
    const phases = parsePhasesFromPlan(REAL_PLAN)
    expect(phases[0].phaseNumber).toBe(1)
    expect(phases[1].phaseNumber).toBe(2)
    expect(phases[2].phaseNumber).toBe(3)
  })

  it("extracts phase names correctly", () => {
    const phases = parsePhasesFromPlan(REAL_PLAN)
    expect(phases[0].name).toBe("Core Infrastructure Setup")
    expect(phases[1].name).toBe("Manual Test Data Entry")
    expect(phases[2].name).toBe("PDF Import and Processing")
  })

  it("extracts exit criteria as joined bullet points", () => {
    const phases = parsePhasesFromPlan(REAL_PLAN)
    expect(phases[0].exitCriteria).toContain("Application launches successfully")
    expect(phases[0].exitCriteria).toContain("SQLite database creates and migrates")
    expect(phases[0].exitCriteria).toContain("File uploads work")
    expect(phases[0].exitCriteria).toContain("Basic navigation")
  })

  it("all phases default to pending status", () => {
    const phases = parsePhasesFromPlan(REAL_PLAN)
    for (const phase of phases) {
      expect(phase.status).toBe("pending")
    }
  })

  it("returns empty array for markdown with no phases", () => {
    expect(parsePhasesFromPlan("# Just a heading\nSome text.")).toEqual([])
    expect(parsePhasesFromPlan("")).toEqual([])
  })

  it("handles Phase N — Name format (em dash)", () => {
    const md = `### Phase 1 — Setup\n**Exit Criteria**:\n- Done`
    const phases = parsePhasesFromPlan(md)
    expect(phases).toHaveLength(1)
    expect(phases[0].name).toBe("Setup")
  })

  it("handles Phase N - Name format (hyphen)", () => {
    const md = `### Phase 1 - Setup\n**Exit Criteria**:\n- Done`
    const phases = parsePhasesFromPlan(md)
    expect(phases).toHaveLength(1)
    expect(phases[0].name).toBe("Setup")
  })

  it("handles phases with no exit criteria", () => {
    const md = `### Phase 1: Setup\nSome description\n### Phase 2: Build\nMore stuff`
    const phases = parsePhasesFromPlan(md)
    expect(phases).toHaveLength(2)
    expect(phases[0].exitCriteria).toBeNull()
    expect(phases[1].exitCriteria).toBeNull()
  })

  it("stops phase at next ## heading", () => {
    const md = `### Phase 1: Setup\n**Exit Criteria**:\n- Done\n\n## Some Other Section\nNot part of phases`
    const phases = parsePhasesFromPlan(md)
    expect(phases).toHaveLength(1)
  })

  it("extracts From/To description", () => {
    const phases = parsePhasesFromPlan(REAL_PLAN)
    expect(phases[0].description).toContain("From: Empty repository")
    expect(phases[0].description).toContain("To: Working Electron application")
  })
})

describe("parsePhaseStatus", () => {
  it("returns pending for empty log", () => {
    expect(parsePhaseStatus("", 1)).toBe("pending")
  })

  it("detects completed status", () => {
    const log = "### Phase 1 completed\n- All tasks done"
    expect(parsePhaseStatus(log, 1)).toBe("completed")
  })

  it("detects active status", () => {
    const log = "Phase 2 started — agent spawned"
    expect(parsePhaseStatus(log, 2)).toBe("active")
  })

  it("detects failed status", () => {
    const log = "Phase 3 failed — build errors"
    expect(parsePhaseStatus(log, 3)).toBe("failed")
  })

  it("detects review status", () => {
    const log = "Phase 1 pending review — approval gate"
    expect(parsePhaseStatus(log, 1)).toBe("review")
  })

  it("ignores unrelated phase numbers", () => {
    const log = "Phase 2 completed"
    expect(parsePhaseStatus(log, 1)).toBe("pending")
  })

  it("uses latest status when multiple entries exist", () => {
    const log = "Phase 1 started\nPhase 1 completed"
    expect(parsePhaseStatus(log, 1)).toBe("completed")
  })
})
