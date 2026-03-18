import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import path from "node:path"
import fs from "node:fs"
import * as schema from "./schema"

function getDbPath(): string {
  if (process.env.HQ_DATA_DIR) {
    return path.join(process.env.HQ_DATA_DIR, "hq.db")
  }

  // In Electron production: use HOME/Library/Application Support/AutEng HQ/
  // In dev: use local data/ directory
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_DEV_URL) {
    const appData =
      process.env.APPDATA ||
      (process.platform === "darwin"
        ? path.join(process.env.HOME || "~", "Library", "Application Support")
        : path.join(process.env.HOME || "~", ".local", "share"))
    return path.join(appData, "AutEng HQ", "hq.db")
  }

  return path.join(process.cwd(), "data", "hq.db")
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    workspace_path TEXT,
    deploy_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS phases (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    phase_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    exit_criteria TEXT,
    started_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    phase_id TEXT REFERENCES phases(id),
    agent_type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    command TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    output TEXT,
    session_id TEXT,
    model TEXT,
    exit_code INTEGER,
    cost_usd REAL,
    turn_count INTEGER,
    max_turns INTEGER,
    budget_usd REAL,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS background_processes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    process_type TEXT NOT NULL,
    command TEXT NOT NULL,
    args TEXT,
    status TEXT NOT NULL DEFAULT 'starting',
    port INTEGER,
    url TEXT,
    started_at TEXT NOT NULL,
    stopped_at TEXT
  );

  CREATE TABLE IF NOT EXISTS process_configs (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    max_agents INTEGER DEFAULT 5,
    max_background INTEGER DEFAULT 3,
    default_model TEXT DEFAULT 'sonnet',
    default_max_turns INTEGER DEFAULT 50,
    default_budget_usd REAL DEFAULT 5.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kpi_snapshots (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    recorded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deploy_events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    platform TEXT NOT NULL,
    environment TEXT NOT NULL,
    version_label TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    url TEXT,
    deployed_at TEXT NOT NULL
  );
`

let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (!_db) {
    const dbPath = getDbPath()

    // Ensure directory exists
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const sqlite = new Database(dbPath)
    sqlite.pragma("journal_mode = WAL")
    sqlite.pragma("foreign_keys = ON")

    // Ensure tables exist (idempotent)
    sqlite.exec(SCHEMA_SQL)

    _db = drizzle(sqlite, { schema })
  }

  return _db
}

export { schema }
