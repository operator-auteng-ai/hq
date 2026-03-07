import { getGrouped } from "@/components/registry/helpers"
import type { AtomicLevel } from "@/components/registry/types"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const levelLabels: Record<AtomicLevel, string> = {
  atom: "Atoms",
  molecule: "Molecules",
  component: "Components",
}

const levelDescriptions: Record<AtomicLevel, string> = {
  atom: "Single-purpose primitives. No business logic.",
  molecule: "Composed from 2+ atoms. May carry light domain awareness.",
  component: "Full feature blocks with their own data flow.",
}

export default function ComponentsPage() {
  const grouped = getGrouped()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Components</h1>
        <p className="mt-2 text-muted-foreground">
          All registered UI components organized by atomic level.
        </p>
      </div>

      {(["atom", "molecule", "component"] as AtomicLevel[]).map((level) => (
        <div key={level}>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{levelLabels[level]}</h2>
            <p className="text-sm text-muted-foreground">
              {levelDescriptions[level]}
            </p>
          </div>
          {grouped[level].length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No {levelLabels[level].toLowerCase()} registered yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[level].map((entry) => (
                <Card key={entry.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{entry.label}</CardTitle>
                      <Badge variant="secondary">{entry.sublabel}</Badge>
                    </div>
                    <CardDescription>{entry.description}</CardDescription>
                    <code className="mt-1 block font-mono text-xs text-muted-foreground">
                      {entry.source}
                    </code>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
