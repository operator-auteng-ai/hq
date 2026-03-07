import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const baseColors = [
  { name: "background", class: "bg-background" },
  { name: "foreground", class: "bg-foreground" },
  { name: "primary", class: "bg-primary" },
  { name: "secondary", class: "bg-secondary" },
  { name: "muted", class: "bg-muted" },
  { name: "accent", class: "bg-accent" },
  { name: "destructive", class: "bg-destructive" },
  { name: "card", class: "bg-card" },
  { name: "popover", class: "bg-popover" },
  { name: "border", class: "bg-border" },
  { name: "input", class: "bg-input" },
  { name: "ring", class: "bg-ring" },
]

const statusColors = [
  { name: "status-running", class: "bg-status-running" },
  { name: "status-completed", class: "bg-status-completed" },
  { name: "status-failed", class: "bg-status-failed" },
  { name: "status-queued", class: "bg-status-queued" },
  { name: "status-paused", class: "bg-status-paused" },
  { name: "status-draft", class: "bg-status-draft" },
]

const chartColors = [
  { name: "chart-1", class: "bg-chart-1" },
  { name: "chart-2", class: "bg-chart-2" },
  { name: "chart-3", class: "bg-chart-3" },
  { name: "chart-4", class: "bg-chart-4" },
  { name: "chart-5", class: "bg-chart-5" },
]

const sidebarColors = [
  { name: "sidebar", class: "bg-sidebar" },
  { name: "sidebar-foreground", class: "bg-sidebar-foreground" },
  { name: "sidebar-primary", class: "bg-sidebar-primary" },
  { name: "sidebar-accent", class: "bg-sidebar-accent" },
  { name: "sidebar-border", class: "bg-sidebar-border" },
]

function ColorGrid({
  title,
  colors,
}: {
  title: string
  colors: { name: string; class: string }[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {colors.map((c) => (
            <div key={c.name} className="flex items-center gap-3">
              <div
                className={`h-8 w-8 shrink-0 rounded-md border ${c.class}`}
              />
              <span className="truncate font-mono text-xs">{c.name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const typeScale = [
  { class: "text-xs", label: "text-xs", size: "12px" },
  { class: "text-sm", label: "text-sm", size: "14px" },
  { class: "text-base", label: "text-base", size: "16px" },
  { class: "text-lg", label: "text-lg", size: "18px" },
  { class: "text-xl", label: "text-xl", size: "20px" },
  { class: "text-2xl", label: "text-2xl", size: "24px" },
  { class: "text-3xl", label: "text-3xl", size: "30px" },
]

const spacingScale = [
  { token: "1", value: "4px" },
  { token: "1.5", value: "6px" },
  { token: "2", value: "8px" },
  { token: "3", value: "12px" },
  { token: "4", value: "16px" },
  { token: "6", value: "24px" },
  { token: "8", value: "32px" },
  { token: "12", value: "48px" },
  { token: "16", value: "64px" },
]

const radiusScale = [
  { class: "rounded-sm", label: "sm" },
  { class: "rounded-md", label: "md" },
  { class: "rounded-lg", label: "lg" },
  { class: "rounded-xl", label: "xl" },
  { class: "rounded-2xl", label: "2xl" },
]

const shadowScale = [
  { class: "shadow-xs", label: "xs" },
  { class: "shadow-sm", label: "sm" },
  { class: "shadow-md", label: "md" },
  { class: "shadow-lg", label: "lg" },
  { class: "shadow-xl", label: "xl" },
]

export default function TokensPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Tokens</h1>
        <p className="mt-2 text-muted-foreground">
          Design tokens powering every visual decision in HQ.
        </p>
      </div>

      <ColorGrid title="Base Palette" colors={baseColors} />
      <ColorGrid title="Status Colors (L3)" colors={statusColors} />
      <ColorGrid title="Chart Colors" colors={chartColors} />
      <ColorGrid title="Sidebar" colors={sidebarColors} />

      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {typeScale.map((t) => (
            <div key={t.label} className="flex items-baseline gap-4">
              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                {t.label}
              </span>
              <span className={t.class}>
                The quick brown fox ({t.size})
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spacing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {spacingScale.map((s) => (
            <div key={s.token} className="flex items-center gap-4">
              <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                {s.token}
              </span>
              <div
                className="h-4 rounded-sm bg-primary"
                style={{ width: s.value }}
              />
              <span className="font-mono text-xs text-muted-foreground">
                {s.value}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Border Radius</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {radiusScale.map((r) => (
                <div key={r.label} className="text-center">
                  <div
                    className={`h-16 w-16 border-2 border-primary bg-primary/10 ${r.class}`}
                  />
                  <span className="mt-1 block font-mono text-xs text-muted-foreground">
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shadows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {shadowScale.map((s) => (
                <div key={s.label} className="text-center">
                  <div
                    className={`h-16 w-16 rounded-lg bg-card ${s.class}`}
                  />
                  <span className="mt-1 block font-mono text-xs text-muted-foreground">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
