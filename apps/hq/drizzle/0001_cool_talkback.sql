CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer NOT NULL,
	`is_mvp_boundary` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `phases` (
	`id` text PRIMARY KEY NOT NULL,
	`milestone_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`exit_criteria` text,
	`sort_order` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_result` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `release_milestones` (
	`release_id` text NOT NULL,
	`milestone_id` text NOT NULL,
	PRIMARY KEY(`release_id`, `milestone_id`),
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_label` text NOT NULL,
	`tag` text,
	`notes` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`published_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`phase_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source_doc` text,
	`sort_order` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `task_id` text REFERENCES tasks(id);--> statement-breakpoint
ALTER TABLE `projects` ADD `vision_hypothesis` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `success_metric` text;