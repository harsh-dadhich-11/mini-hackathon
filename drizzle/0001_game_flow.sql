CREATE TABLE `captain_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`link_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `captain_codes_email_idx` ON `captain_codes` (`email`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `captain_codes_link_unique` ON `captain_codes` (`link_hash`);--> statement-breakpoint
CREATE TABLE `captain_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `captain_sessions_team_idx` ON `captain_sessions` (`team_id`);--> statement-breakpoint
CREATE TABLE `qualifications` (
	`stage` text NOT NULL,
	`team_id` text NOT NULL,
	`rank` integer NOT NULL,
	`score` integer NOT NULL,
	`ruling_note` text,
	`decided_by` text NOT NULL,
	`decided_at` text NOT NULL,
	PRIMARY KEY(`stage`, `team_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `rounds` ADD `evidence_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `paused_remaining_ms` integer;--> statement-breakpoint
ALTER TABLE `score_lines` ADD `override_points` integer;--> statement-breakpoint
ALTER TABLE `score_lines` ADD `override_reason` text;--> statement-breakpoint
ALTER TABLE `score_lines` ADD `overridden_by` text;--> statement-breakpoint
ALTER TABLE `teams` ADD `last_sign_in_at` text;