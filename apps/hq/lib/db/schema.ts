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

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  phaseId: text("phase_id").references(() => phases.id),
  agentType: text("agent_type").notNull(),
  prompt: text("prompt").notNull(),
  command: text("command"),
  status: text("status").notNull().default("queued"),
  output: text("output"),
  sessionId: text("session_id"),
  model: text("model"),
  exitCode: integer("exit_code"),
  costUsd: real("cost_usd"),
  turnCount: integer("turn_count"),
  maxTurns: integer("max_turns"),
  budgetUsd: real("budget_usd"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
})

export const backgroundProcesses = sqliteTable("background_processes", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  processType: text("process_type").notNull(),
  command: text("command").notNull(),
  args: text("args"),
  status: text("status").notNull().default("starting"),
  port: integer("port"),
  url: text("url"),
  startedAt: text("started_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  stoppedAt: text("stopped_at"),
})

export const processConfigs = sqliteTable("process_configs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id),
  maxAgents: integer("max_agents").default(5),
  maxBackground: integer("max_background").default(3),
  defaultModel: text("default_model").default("sonnet"),
  defaultMaxTurns: integer("default_max_turns").default(50),
  defaultBudgetUsd: real("default_budget_usd").default(5.0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
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
  versionLabel: text("version_label"),
  status: text("status").notNull().default("pending"),
  url: text("url"),
  deployedAt: text("deployed_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})
