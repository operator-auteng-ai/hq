import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core"

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  visionHypothesis: text("vision_hypothesis"),
  successMetric: text("success_metric"),
  collaborationProfile: text("collaboration_profile").default("operator"),
  planningStep: text("planning_step"),
  status: text("status").notNull().default("draft"),
  workspacePath: text("workspace_path"),
  deployUrl: text("deploy_url"),
  isTest: integer("is_test").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  isMvpBoundary: integer("is_mvp_boundary").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
})

export const phases = sqliteTable("phases", {
  id: text("id").primaryKey(),
  milestoneId: text("milestone_id")
    .notNull()
    .references(() => milestones.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  exitCriteria: text("exit_criteria"),
  sortOrder: integer("sort_order").notNull(),
  status: text("status").notNull().default("pending"),
  reviewResult: text("review_result"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
})

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  phaseId: text("phase_id")
    .notNull()
    .references(() => phases.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  sourceDoc: text("source_doc"),
  sortOrder: integer("sort_order").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
})

export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  versionLabel: text("version_label").notNull(),
  tag: text("tag"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  publishedAt: text("published_at"),
})

export const releaseMilestones = sqliteTable(
  "release_milestones",
  {
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    milestoneId: text("milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.releaseId, table.milestoneId] }),
  }),
)

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  taskId: text("task_id").references(() => tasks.id),
  phaseLabel: text("phase_label"),
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

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  encrypted: integer("encrypted").notNull().default(0),
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

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  icon: text("icon"),
  actionProposed: text("action_proposed"),
  actionExecuted: integer("action_executed").notNull().default(0),
  createdAt: text("created_at")
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
