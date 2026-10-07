CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`detail_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `event_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leaderboard_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`rank_limit` integer NOT NULL,
	`entries_json` text NOT NULL,
	`published_at` text NOT NULL,
	`published_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leaderboard_snapshots_published_idx` ON `leaderboard_snapshots` (`published_at`);--> statement-breakpoint
CREATE TABLE `masters` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`added_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`round_order` integer NOT NULL,
	`title` text NOT NULL,
	`phase` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`scenario` text DEFAULT '' NOT NULL,
	`options_json` text DEFAULT '[]' NOT NULL,
	`answers_json` text DEFAULT '[]' NOT NULL,
	`multiplier` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`opened_at` text,
	`closes_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_order_unique` ON `rounds` (`round_order`);--> statement-breakpoint
CREATE INDEX `rounds_state_order_idx` ON `rounds` (`state`,`round_order`);--> statement-breakpoint
CREATE TABLE `score_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`round_id` text NOT NULL,
	`phase` text NOT NULL,
	`points` integer NOT NULL,
	`calculated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `score_lines_team_round_unique` ON `score_lines` (`team_id`,`round_id`);--> statement-breakpoint
CREATE INDEX `score_lines_phase_team_idx` ON `score_lines` (`phase`,`team_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`round_id` text NOT NULL,
	`choices_json` text NOT NULL,
	`submitted_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_team_round_unique` ON `submissions` (`team_id`,`round_id`);--> statement-breakpoint
CREATE INDEX `submissions_round_idx` ON `submissions` (`round_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`table_number` text NOT NULL,
	`captain_name` text NOT NULL,
	`captain_email` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_captain_email_unique` ON `teams` (`captain_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_name_unique` ON `teams` (`name`);