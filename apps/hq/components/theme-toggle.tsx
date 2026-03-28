"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { MoonIcon, SunIcon } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="h-4 w-4" />
        <span className="text-sm text-muted-foreground">Dark mode</span>
      </div>
    )
  }

  const isDark = resolvedTheme === "dark"

  return (
    <div className="flex items-center justify-between px-2 py-1.5">
      <Label
        htmlFor="theme-toggle"
        className="flex cursor-pointer items-center gap-2 text-sm font-normal"
      >
        {isDark ? (
          <MoonIcon className="h-4 w-4" />
        ) : (
          <SunIcon className="h-4 w-4" />
        )}
        Dark mode
      </Label>
      <Switch
        id="theme-toggle"
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      />
    </div>
  )
}
