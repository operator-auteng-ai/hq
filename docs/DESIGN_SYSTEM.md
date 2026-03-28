# DESIGN SYSTEM — AutEng HQ

## Principle

One source of truth for every visual decision. Tokens define the raw values, components consume them. Nothing is hardcoded.

## Token Architecture

Four tiers — each layer references the one below.

```
L1  Raw Values       →  oklch(0.488 0.243 264.376)
L2  Primitives        →  --primary: oklch(...)
L3  Semantic          →  --status-running: var(--primary)
L4  Component         →  bg-primary, text-status-running
```

- **L1 — Raw values**: OKLch color literals, pixel values, unitless numbers. Never referenced directly in components.
- **L2 — Primitives**: CSS custom properties in `globals.css` `:root` and `.dark`. These are the shadcn base tokens.
- **L3 — Semantic**: Purpose-driven aliases that map to primitives. Domain-specific (agent status, phase state, deploy health).
- **L4 — Component**: Tailwind utility classes generated via `@theme inline`. What developers actually use.

## Colors

### Base Palette (shadcn — taupe / radix-maia)

All colors use OKLch color space. Light and dark mode tokens are defined in `globals.css`.

| Token | Role | Usage |
|-------|------|-------|
| `--background` | Page background | `bg-background` |
| `--foreground` | Default text | `text-foreground` |
| `--primary` | Brand / interactive | `bg-primary`, `text-primary` |
| `--secondary` | Secondary surfaces | `bg-secondary` |
| `--muted` | Subdued backgrounds | `bg-muted` |
| `--accent` | Hover/focus states | `bg-accent` |
| `--destructive` | Errors, danger | `bg-destructive` |
| `--border` | Borders | `border-border` |
| `--input` | Form input borders | `border-input` |
| `--ring` | Focus rings | `ring-ring` |
| `--card` | Card backgrounds | `bg-card` |
| `--popover` | Popovers, dropdowns | `bg-popover` |

### Chart Colors

| Token | Usage |
|-------|-------|
| `--chart-1` through `--chart-5` | KPI charts, trend lines, data viz |

### Status Colors (L3 — to be added to `globals.css`)

These semantic tokens map domain statuses from TAXONOMY.md to visual states.

| Token | Maps To | Used For |
|-------|---------|----------|
| `--status-running` | `--primary` | Agent running, phase active, deploy building |
| `--status-completed` | green | Agent completed, phase completed, deploy live |
| `--status-failed` | `--destructive` | Agent failed, phase failed, deploy failed |
| `--status-queued` | `--muted-foreground` | Agent queued, phase pending |
| `--status-paused` | amber | Agent cancelled, project paused |
| `--status-draft` | `--muted-foreground` | Project draft |

### Sidebar Tokens

| Token | Usage |
|-------|-------|
| `--sidebar` | Sidebar background |
| `--sidebar-foreground` | Sidebar text |
| `--sidebar-primary` | Active nav item |
| `--sidebar-accent` | Hover state |
| `--sidebar-border` | Dividers |

## Typography

### Font Stack

| Variable | Family | Usage |
|----------|--------|-------|
| `--font-sans` | Roboto | All interface text — labels, headings, body |
| `--font-mono` | Geist Mono | Agent output, terminal views, code, data |

### Scale

All sizes use Tailwind defaults. These are the sizes the app should use:

| Class | Size | Usage |
|-------|------|-------|
| `text-xs` | 12px | Badges, timestamps, metadata |
| `text-sm` | 14px | Secondary labels, table cells, form hints |
| `text-base` | 16px | Body text, form inputs, nav items |
| `text-lg` | 18px | Section titles, card headings |
| `text-xl` | 20px | Page subtitles |
| `text-2xl` | 24px | Page titles |
| `text-3xl` | 30px | Dashboard hero numbers (KPI values) |

Do **not** use `text-4xl` or above in the app UI. Those are for marketing pages only.

### Weight

| Weight | Class | Usage |
|--------|-------|-------|
| 400 | `font-normal` | Body text |
| 500 | `font-medium` | Labels, nav items |
| 600 | `font-semibold` | Card headings, section titles |
| 700 | `font-bold` | Page titles, KPI values |

## Spacing

Use Tailwind's default spacing scale. Constrain to these values for consistency:

| Token | Value | Usage |
|-------|-------|-------|
| `1` | 4px | Inline icon gaps |
| `1.5` | 6px | Tight element spacing |
| `2` | 8px | Related element gaps, badge padding |
| `3` | 12px | Card internal padding (tight) |
| `4` | 16px | Card internal padding, section gaps |
| `6` | 24px | Section spacing, card gaps |
| `8` | 32px | Page section spacing |
| `12` | 48px | Major section separation |
| `16` | 64px | Page-level padding |

### Layout Constraints

| Property | Value | Usage |
|----------|-------|-------|
| Max content width | `max-w-7xl` (1280px) | Main content area |
| Sidebar width | `w-64` (256px) | Primary navigation |
| Card min-width | `min-w-[280px]` | Dashboard cards |

## Border Radius

Derived from `--radius: 0.45rem` in `globals.css`. Tailwind generates these:

| Class | Computed | Usage |
|-------|----------|-------|
| `rounded-sm` | 0.27rem | Badges, tags, small elements |
| `rounded-md` | 0.36rem | Inputs, buttons |
| `rounded-lg` | 0.45rem | Cards, containers |
| `rounded-xl` | 0.63rem | Modals, sheets |
| `rounded-2xl` | 0.81rem | Large containers |

## Shadows

| Token | Usage |
|-------|-------|
| `shadow-xs` | Subtle lift — buttons at rest |
| `shadow-sm` | Cards, dropdowns |
| `shadow-md` | Popovers, floating panels |
| `shadow-lg` | Modals, sheets |
| `shadow-xl` | Command palette, overlays |

## Z-Index

| Token | Value | Usage |
|-------|-------|-------|
| `z-0` | 0 | Base content |
| `z-10` | 10 | Sticky headers, sidebar |
| `z-20` | 20 | Dropdowns, popovers |
| `z-30` | 30 | Sheets, drawers |
| `z-40` | 40 | Modals, dialogs |
| `z-50` | 50 | Tooltips, toasts, command palette |

Never use arbitrary z-index values. If a new layer is needed, add it here first.

## Motion

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `duration-100` | 100ms | `ease-out` | Hover states, toggles |
| `duration-200` | 200ms | `ease-out` | Expand/collapse, tabs |
| `duration-300` | 300ms | `ease-in-out` | Modals, sheets, page transitions |
| `duration-500` | 500ms | `ease-in-out` | Progress bars, chart animations |

Prefer `transition-colors` and `transition-opacity` over `transition-all` to avoid layout thrash.

## Component Registry

All React components live in a single registry. Three levels following atomic design:

```
components/
├── ui/                    # shadcn primitives (added via CLI)
│   ├── button.tsx
│   ├── input.tsx
│   ├── card.tsx
│   └── ...
├── registry/
│   ├── types.ts           # AtomicLevel, RegistryEntry types
│   ├── entries.ts         # Canonical list of all components
│   ├── helpers.ts         # getByLevel(), getGrouped(), getCounts()
│   └── demo-map.ts        # Lazy-loaded demo components
```

### Atomic Levels

| Level | Definition | Example |
|-------|-----------|---------|
| **Atom** | Single-purpose primitive. No business logic. Maps 1:1 to a shadcn component or small custom element. | Button, Badge, Input, Avatar, Skeleton |
| **Molecule** | Composed from 2+ atoms. May carry light domain awareness. | StatCard, AgentTaskRow, PhaseCard, DeployEventRow |
| **Component** | Full feature block. Owns a slice of UI with its own data flow. | AgentMonitor, ProjectDashboard, DeployHistory, KPIChart |

### Registry Entry Shape

```typescript
type AtomicLevel = "atom" | "molecule" | "component"

interface RegistryEntry {
  id: string            // kebab-case identifier
  label: string         // Display name
  level: AtomicLevel
  sublabel: string      // Category grouping (e.g., "Navigation", "Agent", "Status")
  source: string        // "@/components/ui/button" or "custom"
  description: string   // What it does, variants, states
}
```

### HQ Component Categories

| Sublabel | Level | Components |
|----------|-------|------------|
| **Buttons** | Atom | Button |
| **Form Controls** | Atom | Input, Textarea, Label, Select |
| **Feedback** | Atom | Badge, Progress, Skeleton |
| **Display** | Atom | Avatar, Tooltip, Separator |
| **Navigation** | Molecule | Sidebar, Breadcrumbs, TabBar |
| **Status** | Molecule | StatusBadge, PhaseCard, AgentTaskRow |
| **Data** | Molecule | StatCard, DataTableRow, DeployEventRow |
| **Charts** | Molecule | KPISparkline, TrendLine |
| **Agent** | Component | AgentMonitor, AgentOutput |
| **Project** | Component | ProjectDashboard, ProjectList, ProjectCreator |
| **Deploy** | Component | DeployHistory, DeployTrigger |
| **KPI** | Component | KPIPanel, KPIChart |

## Design System Route

The app includes a living design system at `/design-system` with three pages:

```
app/design-system/
├── layout.tsx              # Header with page navigation
├── page.tsx                # Gallery overview (category grid)
├── _components/            # DS-specific UI (sidebar, swatch, etc.)
│   ├── ds-sidebar.tsx
│   ├── section-block.tsx
│   ├── sub-label.tsx
│   ├── swatch.tsx
│   ├── scale-row.tsx
│   └── sections-config.ts
├── _registry/
│   ├── demos/
│   │   ├── atoms/          # One demo file per atom
│   │   ├── molecules/      # One demo file per molecule
│   │   └── components/     # One demo file per component
│   └── demo-map.ts
├── components/
│   └── page.tsx            # Atoms / Molecules / Components browser
└── tokens/
    └── page.tsx            # Color, typography, spacing, shadow, motion, z-index
```

### Pages

| Route | Shows |
|-------|-------|
| `/design-system` | Gallery overview — category cards with counts and descriptions |
| `/design-system/components` | Sidebar + component demos grouped by atom / molecule / component |
| `/design-system/tokens` | All design tokens with interactive previews (swatches, type scale, shadow samples) |

### Rules

1. Every component in the registry **must** have a demo
2. Demos use only tokens — no hardcoded colors, sizes, or spacing
3. The design system pages are **dev-only** — excluded from production builds
4. New components are added to `entries.ts` first, then implemented

## UI Patterns

### Status Filtering

List pages that filter by entity status (projects, agents, deploys, etc.) **must** use the `Tabs` component from `@/components/ui/tabs` — not ad-hoc Button groups.

**Pattern:**

```tsx
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const FILTERS = [
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
] as const

// Inside the component:
<Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
  <TabsList>
    {FILTERS.map((f) => (
      <TabsTrigger key={f.value} value={f.value}>
        {f.label}
        {counts[f.value] > 0 && (
          <span className="ml-1.5 rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums">
            {counts[f.value]}
          </span>
        )}
      </TabsTrigger>
    ))}
  </TabsList>
</Tabs>
```

**Rules:**
- Each tab trigger shows a count badge (only when count > 0)
- Count badge uses `bg-muted-foreground/15` with `text-[10px] font-semibold tabular-nums`
- Filter state is managed via `useState` + `useMemo` — do not re-fetch from the API per filter
- Empty state should differentiate "no items at all" from "no items matching filter"

## Cross-References

- Component boundaries and data flow → [ARCH.md](./ARCH.md)
- Entity statuses mapped to status tokens → [TAXONOMY.md](./TAXONOMY.md)
- Code style for components → [CODING_STANDARDS.md](./CODING_STANDARDS.md)
- shadcn base configuration → `components.json` (radix-maia style, taupe base)
- Token definitions → `app/globals.css`
