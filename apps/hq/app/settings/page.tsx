"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  Loader2Icon,
} from "lucide-react"

interface ApiKeyInfo {
  configured: boolean
  hint: string | null
  encrypted: boolean
}

interface SettingsData {
  anthropicApiKey: ApiKeyInfo
  encryptionAvailable: boolean
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    try {
      const res = await fetch("/api/settings")
      if (res.ok) {
        setSettings(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) return

    setSaving(true)
    setSaveStatus("idle")
    setErrorMsg("")

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anthropicApiKey: apiKey }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to save" }))
        setErrorMsg(data.error || "Failed to save")
        setSaveStatus("error")
        return
      }

      setSaveStatus("success")
      setApiKey("")
      setShowKey(false)
      await loadSettings()

      // Reset success indicator after 3s
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setErrorMsg("Network error")
      setSaveStatus("error")
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setSaving(true)
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anthropicApiKey: "" }),
      })
      await loadSettings()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const keyInfo = settings?.anthropicApiKey
  const encrypted = settings?.encryptionAvailable ?? false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure HQ preferences and integrations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">API Keys</CardTitle>
            {encrypted ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheckIcon className="h-3.5 w-3.5 text-green-600" />
                Encrypted with system keychain
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldAlertIcon className="h-3.5 w-3.5 text-yellow-600" />
                Dev mode — stored unencrypted
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="anthropic-key">Anthropic API Key</Label>
              {keyInfo?.configured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <CheckIcon className="h-3 w-3" />
                  Configured {keyInfo.hint ? `(${keyInfo.hint})` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  Not configured
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="anthropic-key"
                  type={showKey ? "text" : "password"}
                  placeholder={keyInfo?.configured ? "Enter new key to replace..." : "sk-ant-..."}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setSaveStatus("idle")
                    setErrorMsg("")
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>

              <Button
                onClick={handleSave}
                disabled={!apiKey.trim() || saving}
              >
                {saving ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : saveStatus === "success" ? (
                  <>
                    <CheckIcon className="mr-1 h-4 w-4" />
                    Saved
                  </>
                ) : (
                  "Save Key"
                )}
              </Button>
            </div>

            {saveStatus === "error" && errorMsg && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}

            {keyInfo?.configured && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={saving}
                className="text-muted-foreground"
              >
                Remove key
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Your API key is stored locally on this device
            {encrypted ? " and encrypted with your system keychain" : ""}.
            It is never sent anywhere except directly to the Anthropic API.
          </p>
        </CardContent>
      </Card>

    </div>
  )
}
