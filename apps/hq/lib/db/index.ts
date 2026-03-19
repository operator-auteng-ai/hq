import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
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

function getMigrationsPath(): string {
  // In production Electron, migrations are bundled alongside the app
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_DEV_URL) {
    return path.join(process.resourcesPath || process.cwd(), "drizzle")
  }
  return path.join(process.cwd(), "drizzle")
}

/**
 * One-time legacy migration for databases created before Drizzle Kit migrations.
 * Runs BEFORE migrate() to bring old schemas into a state where migrate() can
 * safely apply the initial 0000 migration (which will be skipped as "already applied").
 *
 * This function is idempotent — safe to run on fresh DBs and already-migrated DBs.
 */
function migrateLegacySchema(sqlite: InstanceType<typeof Database>) {
  // Check if this is a legacy DB: has tables but no __drizzle_migrations
  const tables = sqlite.pragma("table_list") as Array<{ name: string }>
  const tableNames = tables.map((t) => t.name)
  const hasMigrationsTable = tableNames.includes("__drizzle_migrations")
  const hasProjects = tableNames.includes("projects")

  if (hasMigrationsTable || !hasProjects) return // Already migrated or fresh DB

  // --- Legacy DB detected: has tables but no migration tracking ---

  // Fix agent_runs: remove FK to phases, rename phase_id → phase_label
  if (tableNames.includes("agent_runs")) {
    const fks = sqlite.pragma("foreign_key_list(agent_runs)") as Array<{ table: string }>
    const hasPhasesFK = fks.some((fk) => fk.table === "phases")
    const columns = sqlite.pragma("table_info(agent_runs)") as Array<{ name: string }>
    const hasPhaseId = columns.some((c) => c.name === "phase_id")

    if (hasPhasesFK || hasPhaseId) {
      const sourceCol = hasPhaseId ? "phase_id" : "phase_label"
      sqlite.pragma("foreign_keys = OFF")

      sqlite.exec(`
        CREATE TABLE agent_runs_new (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL,
          phase_label TEXT,
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
          completed_at TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE no action
        );

        INSERT OR IGNORE INTO agent_runs_new
          SELECT id, project_id,
            ${sourceCol} AS phase_label,
            agent_type, prompt, command, status, output,
            session_id, model, exit_code, cost_usd, turn_count,
            max_turns, budget_usd, created_at, completed_at
          FROM agent_runs;

        DROP TABLE agent_runs;
        ALTER TABLE agent_runs_new RENAME TO agent_runs;
      `)

      sqlite.pragma("foreign_keys = ON")
    }
  }

  // Drop legacy tables
  sqlite.exec("DROP TABLE IF EXISTS phases")
  sqlite.exec("DROP TABLE IF EXISTS agent_tasks")

  // Seed the Drizzle migrations table so migrate() skips the initial migration
  // (the tables already exist with the correct schema).
  // Must match Drizzle's own schema exactly.
  const journal = JSON.parse(
    fs.readFileSync(path.join(getMigrationsPath(), "meta", "_journal.json"), "utf-8"),
  ) as { entries: Array<{ tag: string; when: number }> }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    );
  `)

  // Mark all current migrations as already applied
  const insert = sqlite.prepare(
    "INSERT INTO \"__drizzle_migrations\" (hash, created_at) VALUES (?, ?)",
  )
  for (const entry of journal.entries) {
    insert.run(entry.tag, entry.when)
  }
}

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

    // Step 1: Clean up legacy schema (pre-Drizzle Kit databases)
    migrateLegacySchema(sqlite)

    // Step 2: Apply Drizzle Kit migrations (creates tables, applies future changes)
    const db = drizzle(sqlite, { schema })
    migrate(db, { migrationsFolder: getMigrationsPath() })

    _db = db
  }

  return _db
}

export { schema }
