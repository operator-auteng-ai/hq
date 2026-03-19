CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`phase_label` text,
	`agent_type` text NOT NULL,
	`prompt` text NOT NULL,
	`command` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`output` text,
	`session_id` text,
	`model` text,
	`exit_code` integer,
	`cost_usd` real,
	`turn_count` integer,
	`max_turns` integer,
	`budget_usd` real,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`encrypted` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `background_processes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`process_type` text NOT NULL,
	`command` text NOT NULL,
	`args` text,
	`status` text DEFAULT 'starting' NOT NULL,
	`port` integer,
	`url` text,
	`started_at` text NOT NULL,
	`stopped_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deploy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`platform` text NOT NULL,
	`environment` text NOT NULL,
	`version_label` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`url` text,
	`deployed_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kpi_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`metric_name` text NOT NULL,
	`metric_value` real NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `process_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`max_agents` integer DEFAULT 5,
	`max_background` integer DEFAULT 3,
	`default_model` text DEFAULT 'sonnet',
	`default_max_turns` integer DEFAULT 50,
	`default_budget_usd` real DEFAULT 5,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`workspace_path` text,
	`deploy_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
