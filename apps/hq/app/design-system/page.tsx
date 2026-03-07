import { getCounts } from "@/components/registry/helpers"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import Link from "next/link"

const categories = [
  {
    title: "Tokens",
    href: "/design-system/tokens",
    description: "Colors, typography, spacing, shadows, motion, z-index scales.",
  },
  {
    title: "Components",
    href: "/design-system/components",
    description: "Atoms, molecules, and components with live demos.",
  },
]

export default function DesignSystemPage() {
  const counts = getCounts()

  return (
    <div>
      <h1 className="text-2xl font-bold">Design System</h1>
      <p className="mt-2 text-muted-foreground">
        Tokens, components, and patterns for AutEng HQ.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {categories.map((cat) => (
          <Link key={cat.href} href={cat.href}>
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle>{cat.title}</CardTitle>
                <CardDescription>{cat.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Registry Summary</h2>
        <div className="mt-3 flex gap-6 text-sm">
          <div>
            <span className="font-mono text-2xl font-bold">{counts.atom}</span>
            <span className="ml-2 text-muted-foreground">atoms</span>
          </div>
          <div>
            <span className="font-mono text-2xl font-bold">{counts.molecule}</span>
            <span className="ml-2 text-muted-foreground">molecules</span>
          </div>
          <div>
            <span className="font-mono text-2xl font-bold">{counts.component}</span>
            <span className="ml-2 text-muted-foreground">components</span>
          </div>
        </div>
      </div>
    </div>
  )
}
