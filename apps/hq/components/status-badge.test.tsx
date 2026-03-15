import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatusBadge } from "./status-badge"

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(<StatusBadge status="draft" />)
    expect(screen.getByText("draft")).toBeInTheDocument()
  })

  it("applies capitalize class", () => {
    render(<StatusBadge status="planning" />)
    const badge = screen.getByText("planning")
    expect(badge).toHaveClass("capitalize")
  })

  it("renders with custom className", () => {
    render(<StatusBadge status="draft" className="ml-2" />)
    const badge = screen.getByText("draft")
    expect(badge).toHaveClass("ml-2")
  })

  it("renders all known statuses without error", () => {
    const statuses = [
      "draft",
      "planning",
      "building",
      "deployed",
      "paused",
      "archived",
      "pending",
      "active",
      "completed",
      "failed",
      "running",
      "queued",
    ]

    for (const status of statuses) {
      const { unmount } = render(<StatusBadge status={status} />)
      expect(screen.getByText(status)).toBeInTheDocument()
      unmount()
    }
  })

  it("handles unknown status gracefully", () => {
    render(<StatusBadge status="unknown_status" />)
    expect(screen.getByText("unknown_status")).toBeInTheDocument()
  })
})
