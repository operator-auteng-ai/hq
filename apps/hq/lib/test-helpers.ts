import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./db/schema"

/**
 * Create an in-memory SQLite database for testing.
 * Returns a drizzle instance with all tables created.
 */
export function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  // Create tables manually (Drizzle ORM doesn't auto-create)
  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      workspace_path TEXT,
      deploy_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE phases (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      phase_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      exit_criteria TEXT,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE agent_runs (
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

    CREATE TABLE background_processes (
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

    CREATE TABLE process_configs (
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

    CREATE TABLE kpi_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE deploy_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      platform TEXT NOT NULL,
      environment TEXT NOT NULL,
      version_label TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      url TEXT,
      deployed_at TEXT NOT NULL
    );
  `)

  return drizzle(sqlite, { schema })
}

/**
 * Seed a test project into the database.
 */
export function seedProject(
  db: ReturnType<typeof createTestDb>,
  overrides: Partial<typeof schema.projects.$inferInsert> = {},
) {
  const project = {
    id: crypto.randomUUID(),
    name: "Test Project",
    prompt: "A test project for unit testing purposes.",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }

  db.insert(schema.projects).values(project).run()
  return project
}
