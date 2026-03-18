# Phase 2.99 — Secure API Key Management (Detailed Design)

## Problem

The app requires an Anthropic API key for doc generation and agent execution. Currently reads from `process.env.ANTHROPIC_API_KEY`, which works in dev but fails in the distributed Electron desktop app — users can't set env vars and we can't bundle our own key.

## Solution: Master Key + Encrypted Settings

Store a master encryption key in the OS keychain (via Electron `safeStorage`). Use it to encrypt sensitive settings before writing to SQLite. Users enter their API key in a Settings page; it's encrypted at rest and decrypted in memory only when needed.

## Security Architecture

```
┌─────────────────────────────────────────────────────┐
│                  OS Keychain                         │
│  macOS: Keychain Access                             │
│  Windows: DPAPI                                     │
│  Linux: libsecret / gnome-keyring                   │
│                                                     │
│  Stores: encrypted master key blob                  │
│  (via Electron safeStorage.encryptString)            │
└───────────────────────┬─────────────────────────────┘
                        │ decrypt at startup
                        ▼
┌─────────────────────────────────────────────────────┐
│              Electron Main Process                   │
│                                                     │
│  1. Read encrypted master key from master.key file  │
│  2. Decrypt with safeStorage.decryptString()        │
│  3. Hex-encode → pass as HQ_MASTER_KEY env var      │
│  4. Fork Next.js child process with env             │
└───────────────────────┬─────────────────────────────┘
                        │ HQ_MASTER_KEY env var
                        ▼
┌─────────────────────────────────────────────────────┐
│              Next.js Server Process                  │
│                                                     │
│  secrets.ts service:                                │
│  - getMasterKey() → reads process.env.HQ_MASTER_KEY │
│  - encrypt(plaintext, key) → AES-256-GCM ciphertext│
│  - decrypt(ciphertext, key) → plaintext             │
│  - setSecret(name, value) → encrypt + store in DB   │
│  - getSecret(name) → read from DB + decrypt         │
│  - getAnthropicApiKey() → DB → env fallback         │
└───────────────────────┬─────────────────────────────┘
                        │ encrypted values
                        ▼
┌─────────────────────────────────────────────────────┐
│                SQLite Database                       │
│                                                     │
│  app_settings table:                                │
│  ┌──────────────────┬──────────────────┬──────────┐ │
│  │ key (PK)         │ value            │encrypted │ │
│  ├──────────────────┼──────────────────┼──────────┤ │
│  │ anthropic_api_key│ a1b2c3:d4e5:f6..│ 1        │ │
│  │ default_model    │ sonnet           │ 0        │ │
│  └──────────────────┴──────────────────┴──────────┘ │
│                                                     │
│  Sensitive values: AES-256-GCM ciphertext (hex)     │
│  Non-sensitive values: plaintext                    │
└─────────────────────────────────────────────────────┘
```

## Dev Mode Fallback

When running `pnpm dev` (browser only, no Electron):

- No `HQ_MASTER_KEY` available → `getMasterKey()` returns `null`
- `setSecret()` stores values as plaintext with `encrypted=0`
- `getAnthropicApiKey()` falls back to `process.env.ANTHROPIC_API_KEY`
- Settings page shows info note: "Running in dev mode — keys stored unencrypted. In the desktop app, keys are encrypted with your system keychain."

## Encryption Details

- Algorithm: AES-256-GCM (authenticated encryption)
- Key: 32-byte random master key (generated once, stored in keychain)
- IV: 12-byte random per encryption (prepended to ciphertext)
- Auth tag: 16 bytes (appended to ciphertext)
- Storage format: `<iv-hex>:<auth-tag-hex>:<ciphertext-hex>`
- Implementation: Node.js built-in `crypto` module (no external deps)

## Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/services/secrets.ts` | Master key encrypt/decrypt, settings CRUD |
| `lib/services/secrets.test.ts` | Tests for encrypt/decrypt roundtrip, DB storage, env fallback |
| `app/api/settings/route.ts` | GET/PUT for reading/saving settings |

### Modified Files

| File | Change |
|------|--------|
| `lib/db/schema.ts` | Add `appSettings` table |
| `lib/db/index.ts` | Add `app_settings` CREATE TABLE to SCHEMA_SQL |
| `electron/main.ts` | Generate/load master key at startup, pass to Next.js |
| `app/settings/page.tsx` | Replace stub with API key form |
| `lib/services/doc-generator.ts` | Accept `apiKey` parameter instead of reading env |
| `app/api/projects/[id]/generate/route.ts` | Use secrets service, update error message |

## Database Schema Addition

```typescript
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  encrypted: integer("encrypted").notNull().default(0),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})
```

## API Design

### GET `/api/settings`

Returns settings with sensitive values masked.

```json
{
  "anthropicApiKey": {
    "configured": true,
    "hint": "sk-...3xYz",
    "encrypted": true
  }
}
```

### PUT `/api/settings`

```json
// Request
{ "anthropicApiKey": "sk-ant-..." }

// Response (200)
{ "saved": true, "encrypted": true }

// Response (400) — invalid key format
{ "error": "API key must start with 'sk-'" }
```

## Electron Main Process Changes

```typescript
// In electron/main.ts, before forking Next.js:

import { safeStorage } from "electron"
import crypto from "node:crypto"

const MASTER_KEY_FILE = path.join(dataDir, "master.key")

function loadOrCreateMasterKey(): string {
  if (fs.existsSync(MASTER_KEY_FILE)) {
    const encrypted = fs.readFileSync(MASTER_KEY_FILE)
    return safeStorage.decryptString(encrypted)
  }

  // First launch: generate new master key
  const masterKey = crypto.randomBytes(32).toString("hex")
  const encrypted = safeStorage.encryptString(masterKey)
  fs.writeFileSync(MASTER_KEY_FILE, encrypted)
  return masterKey
}

// Pass to Next.js child process
const masterKey = loadOrCreateMasterKey()
childProcess.env.HQ_MASTER_KEY = masterKey
```

## Settings Page UI

```
┌─────────────────────────────────────────────────┐
│ Settings                                         │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ API Keys                                     │ │
│ │                                              │ │
│ │ Anthropic API Key        ● Configured        │ │
│ │ ┌──────────────────────────────────────┐     │ │
│ │ │ ••••••••••••••••••••3xYz        👁   │     │ │
│ │ └──────────────────────────────────────┘     │ │
│ │                                              │ │
│ │ 🔒 Encrypted with system keychain            │ │
│ │                                              │ │
│ │                          [ Save Key ]        │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ℹ️ Your API key is stored locally on this       │
│   device and encrypted with your system          │
│   keychain. It is never sent anywhere except     │
│   directly to the Anthropic API.                 │
└─────────────────────────────────────────────────┘
```

## Secret Service API (`lib/services/secrets.ts`)

```typescript
// Core crypto
function encrypt(plaintext: string, masterKey: string): string
function decrypt(ciphertext: string, masterKey: string): string

// Master key access
function getMasterKey(): string | null

// Settings CRUD (handles encryption transparently)
function setSecret(key: string, value: string): void
function getSecret(key: string): string | null
function deleteSecret(key: string): void

// Convenience
function getAnthropicApiKey(): string | null
function isEncryptionAvailable(): boolean
```

## Test Plan

| Test | What it verifies |
|------|-----------------|
| `encrypt → decrypt roundtrip` | Ciphertext decrypts back to original |
| `decrypt with wrong key fails` | Authentication tag verification |
| `setSecret + getSecret with master key` | DB stores ciphertext, returns plaintext |
| `setSecret + getSecret without master key` | DB stores plaintext, returns plaintext |
| `getAnthropicApiKey from DB` | Reads from app_settings table |
| `getAnthropicApiKey env fallback` | Returns env var when DB has no key |
| `getAnthropicApiKey returns null` | Neither DB nor env has key |
| `GET /api/settings returns masked key` | Only hint visible, not full key |
| `PUT /api/settings validates format` | Rejects keys not starting with sk- |
| `PUT /api/settings saves and encrypts` | Key stored as ciphertext in DB |
| `Settings page renders` | Form loads without errors |
| `doc-generator uses provided key` | No longer reads process.env internally |
| `generate endpoint reads from secrets` | Uses getAnthropicApiKey() |
| `generate endpoint error directs to Settings` | Clear error message |

## Smoke Test

1. `pnpm dev` → navigate to `/settings` → enter API key → save → reload → see "Configured" badge
2. Navigate to project → click Generate Docs → verify it uses saved key
3. Remove key from settings → Generate Docs → verify error says "Configure your API key in Settings"
4. Electron build → verify master key file created → verify DB values are encrypted → verify decryption works on restart
