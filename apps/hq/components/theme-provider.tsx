"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeHotkey />
      {children}
    </NextThemesProvider>
  )
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

const THEME_HOTKEY_KEY = "auteng-theme-hotkey-enabled"

function isThemeHotkeyEnabled(): boolean {
  if (typeof window === "undefined") return false
  return localStorage.getItem(THEME_HOTKEY_KEY) !== "false"
}

function setThemeHotkeyEnabled(enabled: boolean) {
  localStorage.setItem(THEME_HOTKEY_KEY, String(enabled))
  window.dispatchEvent(new Event("theme-hotkey-changed"))
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()
  const [enabled, setEnabled] = React.useState(true)

  React.useEffect(() => {
    setEnabled(isThemeHotkeyEnabled())

    function onStorageChange() {
      setEnabled(isThemeHotkeyEnabled())
    }

    window.addEventListener("theme-hotkey-changed", onStorageChange)
    window.addEventListener("storage", onStorageChange)
    return () => {
      window.removeEventListener("theme-hotkey-changed", onStorageChange)
      window.removeEventListener("storage", onStorageChange)
    }
  }, [])

  React.useEffect(() => {
    if (!enabled) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme, enabled])

  return null
}

export { ThemeProvider, isThemeHotkeyEnabled, setThemeHotkeyEnabled }
