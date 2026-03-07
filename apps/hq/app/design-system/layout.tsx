"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const dsNav = [
  { label: "Overview", href: "/design-system" },
  { label: "Tokens", href: "/design-system/tokens" },
  { label: "Components", href: "/design-system/components" },
]

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div>
      <div className="mb-6 flex items-center gap-1 border-b">
        {dsNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              pathname === item.href
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  )
}
