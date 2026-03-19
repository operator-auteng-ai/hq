import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import * as schema from "./db/schema"

/**
 * Create an in-memory SQLite database for testing.
 * Applies Drizzle Kit migrations — same path as production.
 */
export function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") })

  return db
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
