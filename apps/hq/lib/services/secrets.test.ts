import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import crypto from "node:crypto"
import * as schema from "@/lib/db/schema"
import { encrypt, decrypt, getMasterKey, isEncryptionAvailable } from "./secrets"

// Generate a valid 32-byte hex master key for tests
const TEST_MASTER_KEY = crypto.randomBytes(32).toString("hex")

describe("secrets — crypto", () => {
  it("encrypt → decrypt roundtrip produces original value", () => {
    const plaintext = "sk-ant-api03-test-key-1234567890"
    const ciphertext = encrypt(plaintext, TEST_MASTER_KEY)
    const result = decrypt(ciphertext, TEST_MASTER_KEY)
    expect(result).toBe(plaintext)
  })

  it("ciphertext format is iv:authTag:encrypted (hex)", () => {
    const ciphertext = encrypt("hello", TEST_MASTER_KEY)
    const parts = ciphertext.split(":")
    expect(parts).toHaveLength(3)
    expect(parts[0]).toHaveLength(24) // IV: 12 bytes = 24 hex
    expect(parts[1]).toHaveLength(32) // Auth tag: 16 bytes = 32 hex
    expect(parts[2].length).toBeGreaterThan(0)
  })

  it("different encryptions produce different ciphertexts (random IV)", () => {
    const plaintext = "sk-ant-api03-test-key"
    const ct1 = encrypt(plaintext, TEST_MASTER_KEY)
    const ct2 = encrypt(plaintext, TEST_MASTER_KEY)
    expect(ct1).not.toBe(ct2)
    expect(decrypt(ct1, TEST_MASTER_KEY)).toBe(plaintext)
    expect(decrypt(ct2, TEST_MASTER_KEY)).toBe(plaintext)
  })

  it("decrypt with wrong key throws", () => {
    const ciphertext = encrypt("secret", TEST_MASTER_KEY)
    const wrongKey = crypto.randomBytes(32).toString("hex")
    expect(() => decrypt(ciphertext, wrongKey)).toThrow()
  })

  it("encrypt rejects invalid key length", () => {
    expect(() => encrypt("test", "short")).toThrow("Master key must be 32 bytes")
  })

  it("decrypt rejects malformed ciphertext", () => {
    expect(() => decrypt("not-valid", TEST_MASTER_KEY)).toThrow("Invalid ciphertext format")
    expect(() => decrypt("aa:bb:cc", TEST_MASTER_KEY)).toThrow("Invalid ciphertext components")
  })

  it("handles empty string", () => {
    const ciphertext = encrypt("", TEST_MASTER_KEY)
    expect(decrypt(ciphertext, TEST_MASTER_KEY)).toBe("")
  })

  it("handles unicode content", () => {
    const plaintext = "sk-key-with-émojis-🔑"
    const ciphertext = encrypt(plaintext, TEST_MASTER_KEY)
    expect(decrypt(ciphertext, TEST_MASTER_KEY)).toBe(plaintext)
  })
})

describe("secrets — getMasterKey", () => {
  const originalEnv = process.env.HQ_MASTER_KEY

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.HQ_MASTER_KEY = originalEnv
    } else {
      delete process.env.HQ_MASTER_KEY
    }
  })

  it("returns key from env when set", () => {
    process.env.HQ_MASTER_KEY = TEST_MASTER_KEY
    expect(getMasterKey()).toBe(TEST_MASTER_KEY)
  })

  it("returns null when env is empty", () => {
    process.env.HQ_MASTER_KEY = ""
    expect(getMasterKey()).toBeNull()
  })

  it("returns null when env is not set", () => {
    delete process.env.HQ_MASTER_KEY
    expect(getMasterKey()).toBeNull()
  })

  it("isEncryptionAvailable mirrors getMasterKey", () => {
    process.env.HQ_MASTER_KEY = TEST_MASTER_KEY
    expect(isEncryptionAvailable()).toBe(true)
    delete process.env.HQ_MASTER_KEY
    expect(isEncryptionAvailable()).toBe(false)
  })
})

describe("secrets — DB operations", () => {
  let testDb: ReturnType<typeof import("@/lib/test-helpers").createTestDb>
  const originalMasterKey = process.env.HQ_MASTER_KEY
  const originalApiKey = process.env.ANTHROPIC_API_KEY

  beforeEach(async () => {
    vi.resetModules()
    const { createTestDb } = await import("@/lib/test-helpers")
    testDb = createTestDb()
  })

  afterEach(() => {
    if (originalMasterKey !== undefined) process.env.HQ_MASTER_KEY = originalMasterKey
    else delete process.env.HQ_MASTER_KEY
    if (originalApiKey !== undefined) process.env.ANTHROPIC_API_KEY = originalApiKey
    else delete process.env.ANTHROPIC_API_KEY
    vi.restoreAllMocks()
  })

  async function getSecrets() {
    vi.doMock("@/lib/db", () => ({
      getDb: () => testDb,
      schema,
    }))
    return await import("./secrets")
  }

  it("setSecret + getSecret with master key encrypts in DB", async () => {
    process.env.HQ_MASTER_KEY = TEST_MASTER_KEY
    const secrets = await getSecrets()

    secrets.setSecret("test_key", "secret_value")
    expect(secrets.getSecret("test_key")).toBe("secret_value")

    // Verify DB has ciphertext
    const { eq } = await import("drizzle-orm")
    const row = testDb.select().from(schema.appSettings).where(eq(schema.appSettings.key, "test_key")).get()
    expect(row?.encrypted).toBe(1)
    expect(row?.value).not.toBe("secret_value")
  })

  it("setSecret + getSecret without master key stores plaintext", async () => {
    delete process.env.HQ_MASTER_KEY
    const secrets = await getSecrets()

    secrets.setSecret("test_key", "plain_value")
    expect(secrets.getSecret("test_key")).toBe("plain_value")

    const { eq } = await import("drizzle-orm")
    const row = testDb.select().from(schema.appSettings).where(eq(schema.appSettings.key, "test_key")).get()
    expect(row?.encrypted).toBe(0)
    expect(row?.value).toBe("plain_value")
  })

  it("getSecret returns null for non-existent key", async () => {
    const secrets = await getSecrets()
    expect(secrets.getSecret("nonexistent")).toBeNull()
  })

  it("setSecret upserts on conflict", async () => {
    delete process.env.HQ_MASTER_KEY
    const secrets = await getSecrets()

    secrets.setSecret("key", "v1")
    expect(secrets.getSecret("key")).toBe("v1")
    secrets.setSecret("key", "v2")
    expect(secrets.getSecret("key")).toBe("v2")
  })

  it("deleteSecret removes the key", async () => {
    delete process.env.HQ_MASTER_KEY
    const secrets = await getSecrets()

    secrets.setSecret("del", "val")
    expect(secrets.getSecret("del")).toBe("val")
    secrets.deleteSecret("del")
    expect(secrets.getSecret("del")).toBeNull()
  })

  it("getAnthropicApiKey reads from DB first", async () => {
    delete process.env.HQ_MASTER_KEY
    process.env.ANTHROPIC_API_KEY = "sk-env-fallback"
    const secrets = await getSecrets()

    secrets.setSecret("anthropic_api_key", "sk-from-db")
    expect(secrets.getAnthropicApiKey()).toBe("sk-from-db")
  })

  it("getAnthropicApiKey falls back to env", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-env-key"
    const secrets = await getSecrets()
    expect(secrets.getAnthropicApiKey()).toBe("sk-env-key")
  })

  it("getAnthropicApiKey returns null when nothing configured", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const secrets = await getSecrets()
    expect(secrets.getAnthropicApiKey()).toBeNull()
  })

  it("getSecretHint returns masked value", async () => {
    delete process.env.HQ_MASTER_KEY
    const secrets = await getSecrets()

    secrets.setSecret("anthropic_api_key", "sk-ant-api03-abcdefgh")
    const hint = secrets.getSecretHint("anthropic_api_key")
    expect(hint.configured).toBe(true)
    expect(hint.hint).toBe("...efgh")
    expect(hint.encrypted).toBe(false)
  })
})
