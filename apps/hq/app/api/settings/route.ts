import { NextRequest, NextResponse } from "next/server"
import {
  setSecret,
  deleteSecret,
  getSecretHint,
  isEncryptionAvailable,
} from "@/lib/services/secrets"

export async function GET() {
  const apiKeyInfo = getSecretHint("anthropic_api_key")

  return NextResponse.json({
    anthropicApiKey: apiKeyInfo,
    encryptionAvailable: isEncryptionAvailable(),
  })
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { anthropicApiKey } = body as { anthropicApiKey?: string }

  if (anthropicApiKey !== undefined) {
    if (anthropicApiKey === "") {
      deleteSecret("anthropic_api_key")
      return NextResponse.json({ saved: true, action: "deleted" })
    }

    if (typeof anthropicApiKey !== "string" || !anthropicApiKey.startsWith("sk-")) {
      return NextResponse.json(
        { error: "API key must start with 'sk-'" },
        { status: 400 },
      )
    }

    setSecret("anthropic_api_key", anthropicApiKey)
    return NextResponse.json({
      saved: true,
      encrypted: isEncryptionAvailable(),
    })
  }

  return NextResponse.json({ error: "No recognized settings provided" }, { status: 400 })
}
