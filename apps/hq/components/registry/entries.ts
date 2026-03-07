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
]
