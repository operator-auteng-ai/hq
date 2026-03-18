import crypto from "node:crypto"
import { getDb, schema } from "@/lib/db"
import { eq } from "drizzle-orm"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export function getMasterKey(): string | null {
  const key = process.env.HQ_MASTER_KEY
  if (!key || key.length === 0) return null
  return key
}

export function isEncryptionAvailable(): boolean {
  return getMasterKey() !== null
}

export function encrypt(plaintext: string, masterKey: string): string {
  const keyBuffer = Buffer.from(masterKey, "hex")
  if (keyBuffer.length !== 32) {
    throw new Error("Master key must be 32 bytes (64 hex chars)")
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decrypt(ciphertext: string, masterKey: string): string {
  const keyBuffer = Buffer.from(masterKey, "hex")
  if (keyBuffer.length !== 32) {
    throw new Error("Master key must be 32 bytes (64 hex chars)")
  }

  const parts = ciphertext.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format")
  }

  const iv = Buffer.from(parts[0], "hex")
  const authTag = Buffer.from(parts[1], "hex")
  const encrypted = Buffer.from(parts[2], "hex")

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid ciphertext components")
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(encrypted) + decipher.final("utf8")
}

export function setSecret(key: string, value: string): void {
  const db = getDb()
  const masterKey = getMasterKey()

  const storedValue = masterKey ? encrypt(value, masterKey) : value
  const isEncrypted = masterKey ? 1 : 0

  db.insert(schema.appSettings)
    .values({
      key,
      value: storedValue,
      encrypted: isEncrypted,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: {
        value: storedValue,
        encrypted: isEncrypted,
        updatedAt: new Date().toISOString(),
      },
    })
    .run()
}

export function getSecret(key: string): string | null {
  const db = getDb()

  const row = db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .get()

  if (!row) return null

  if (row.encrypted) {
    const masterKey = getMasterKey()
    if (!masterKey) {
      // Encrypted value but no master key available — cannot decrypt
      return null
    }
    return decrypt(row.value, masterKey)
  }

  return row.value
}

export function deleteSecret(key: string): void {
  const db = getDb()
  db.delete(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .run()
}

export function getAnthropicApiKey(): string | null {
  // Try DB first
  const dbKey = getSecret("anthropic_api_key")
  if (dbKey) return dbKey

  // Fall back to env var
  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey && envKey.length > 0) return envKey

  return null
}

export function getSecretHint(key: string): { configured: boolean; hint: string | null; encrypted: boolean } {
  const db = getDb()

  const row = db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .get()

  if (!row) {
    // Check env fallback for API key
    if (key === "anthropic_api_key") {
      const envKey = process.env.ANTHROPIC_API_KEY
      if (envKey && envKey.length > 0) {
        const last4 = envKey.slice(-4)
        return { configured: true, hint: `...${last4}`, encrypted: false }
      }
    }
    return { configured: false, hint: null, encrypted: false }
  }

  // For hint, we need to decrypt to get the last 4 chars
  if (row.encrypted) {
    const masterKey = getMasterKey()
    if (masterKey) {
      try {
        const decrypted = decrypt(row.value, masterKey)
        const last4 = decrypted.slice(-4)
        return { configured: true, hint: `...${last4}`, encrypted: true }
      } catch {
        return { configured: true, hint: null, encrypted: true }
      }
    }
    return { configured: true, hint: null, encrypted: true }
  }

  const last4 = row.value.slice(-4)
  return { configured: true, hint: `...${last4}`, encrypted: false }
}
