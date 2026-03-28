import type { RegistryEntry } from "./types"

export const registryEntries: RegistryEntry[] = [
  // Atoms — shadcn primitives
  {
    id: "button",
    label: "Button",
    level: "atom",
    sublabel: "Buttons",
    source: "@/components/ui/button",
    description:
      "Primary action trigger. Variants: default, outline, secondary, ghost, destructive, link. Sizes: xs, sm, default, lg, icon.",
  },
  {
    id: "badge",
    label: "Badge",
    level: "atom",
    sublabel: "Feedback",
    source: "@/components/ui/badge",
    description:
      "Inline status indicator. Variants: default, secondary, destructive, outline.",
  },
  {
    id: "input",
    label: "Input",
    level: "atom",
    sublabel: "Form Controls",
    source: "@/components/ui/input",
    description: "Text input field with focus ring and error states.",
  },
  {
    id: "separator",
    label: "Separator",
    level: "atom",
    sublabel: "Display",
    source: "@/components/ui/separator",
    description:
      "Visual divider. Horizontal or vertical orientation.",
  },
  {
    id: "tooltip",
    label: "Tooltip",
    level: "atom",
    sublabel: "Display",
    source: "@/components/ui/tooltip",
    description: "Contextual hint on hover. Wraps Radix Tooltip.",
  },
  {
    id: "avatar",
    label: "Avatar",
    level: "atom",
    sublabel: "Display",
    source: "@/components/ui/avatar",
    description: "User or entity image with fallback initials.",
  },
  {
    id: "skeleton",
    label: "Skeleton",
    level: "atom",
    sublabel: "Feedback",
    source: "@/components/ui/skeleton",
    description: "Loading placeholder with pulse animation.",
  },
  {
    id: "card",
    label: "Card",
    level: "atom",
    sublabel: "Display",
    source: "@/components/ui/card",
    description:
      "Container with header, content, footer slots. Used for dashboard panels and project summaries.",
  },
  {
    id: "sheet",
    label: "Sheet",
    level: "atom",
    sublabel: "Display",
    source: "@/components/ui/sheet",
    description:
      "Slide-out panel from screen edge. Used by mobile sidebar.",
  },

  // Molecules — composed from atoms
  {
    id: "sidebar",
    label: "Sidebar",
    level: "molecule",
    sublabel: "Navigation",
    source: "@/components/ui/sidebar",
    description:
      "Collapsible navigation panel with menu items, groups, and footer. Includes SidebarProvider, SidebarTrigger, and mobile sheet variant.",
  },
  {
    id: "pipeline-nav",
    label: "PipelineNav",
    level: "molecule",
    sublabel: "Navigation",
    source: "@/components/pipeline-nav",
    description:
      "Horizontal pipeline level navigation with status dots and connectors. Shows 5 decomposition levels: Vision, Milestones, Architecture, Design, Tasks. Clickable when completed or active.",
  },
  {
    id: "system-message",
    label: "SystemMessage",
    level: "molecule",
    sublabel: "Status",
    source: "@/components/system-message",
    description:
      "Compact single-line pipeline event display with icon prefix and timestamp. Icons: running (spinner), completed (check), failed (x), info. Used inline in the chat timeline.",
  },

  // Components — full feature blocks
  {
    id: "artifact-viewer",
    label: "ArtifactViewer",
    level: "component",
    sublabel: "Project",
    source: "@/components/artifact-viewer",
    description:
      "Renders active pipeline artifact based on selected level. Supports markdown with GFM tables/checkboxes. Includes sub-navigation for architecture (milestone arch deltas) and design (phase design docs).",
  },
  {
    id: "milestone-tree",
    label: "MilestoneTree",
    level: "component",
    sublabel: "Project",
    source: "@/components/milestone-tree",
    description:
      "Collapsible delivery tree showing milestones, phases, and tasks with status dots, progress bars, MVP boundary badge, and inline action controls (start/retry/skip/approve/reject).",
  },
]
