import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import path from "node:path"
import * as schema from "./schema"

function getDbPath(): string {
  // In production (Electron), use app.getPath('userData')
  // In dev, use local data directory
  const dataDir = process.env.HQ_DATA_DIR || path.join(process.cwd(), "data")
  return path.join(dataDir, "hq.db")
}

let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (!_db) {
    const dbPath = getDbPath()

    // Ensure directory exists
    const dir = path.dirname(dbPath)
    const fs = require("node:fs")
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const sqlite = new Database(dbPath)
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")

    _db = drizzle(sqlite, { schema })
  }

  return _db
}

export { schema }
