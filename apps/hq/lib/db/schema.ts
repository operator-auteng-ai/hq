import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull().default("draft"),
  workspacePath: text("workspace_path"),
  deployUrl: text("deploy_url"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const phases = sqliteTable("phases", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  phaseNumber: integer("phase_number").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  exitCriteria: text("exit_criteria"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
})

export const agentTasks = sqliteTable("agent_tasks", {
  id: text("id").primaryKey(),
  phaseId: text("phase_id")
    .notNull()
    .references(() => phases.id),
  agentType: text("agent_type").notNull(),
  command: text("command").notNull(),
  status: text("status").notNull().default("queued"),
  output: text("output"),
  exitCode: integer("exit_code"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
})

export const kpiSnapshots = sqliteTable("kpi_snapshots", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  metricName: text("metric_name").notNull(),
  metricValue: real("metric_value").notNull(),
  recordedAt: text("recorded_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const deployEvents = sqliteTable("deploy_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  platform: text("platform").notNull(),
  environment: text("environment").notNull(),
  status: text("status").notNull().default("pending"),
  url: text("url"),
  deployedAt: text("deployed_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})
