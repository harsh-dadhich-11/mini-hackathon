CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"detail_json" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "captain_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL,
	"revoked_at" text
);
--> statement-breakpoint
ALTER TABLE "captain_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leaderboard_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"rank_limit" integer NOT NULL,
	"entries_json" text NOT NULL,
	"published_at" text NOT NULL,
	"published_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "master_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL,
	"revoked_at" text
);
--> statement-breakpoint
ALTER TABLE "master_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "masters" (
	"email" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"added_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "masters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "qualifications" (
	"stage" text NOT NULL,
	"team_id" text NOT NULL,
	"rank" integer NOT NULL,
	"score" integer NOT NULL,
	"ruling_note" text,
	"decided_by" text NOT NULL,
	"decided_at" text NOT NULL,
	CONSTRAINT "qualifications_stage_team_id_pk" PRIMARY KEY("stage","team_id")
);
--> statement-breakpoint
ALTER TABLE "qualifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"round_order" integer NOT NULL,
	"title" text NOT NULL,
	"phase" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"scenario" text DEFAULT '' NOT NULL,
	"options_json" text DEFAULT '[]' NOT NULL,
	"answers_json" text DEFAULT '[]' NOT NULL,
	"evidence_json" text DEFAULT '[]' NOT NULL,
	"multiplier" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"opened_at" text,
	"closes_at" text,
	"paused_remaining_ms" integer,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "score_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round_id" text NOT NULL,
	"phase" text NOT NULL,
	"points" integer NOT NULL,
	"override_points" integer,
	"override_reason" text,
	"overridden_by" text,
	"calculated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round_id" text NOT NULL,
	"choices_json" text NOT NULL,
	"submitted_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"table_number" text NOT NULL,
	"captain_name" text NOT NULL,
	"captain_email" text NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"last_sign_in_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "captain_sessions" ADD CONSTRAINT "captain_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_lines" ADD CONSTRAINT "score_lines_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_lines" ADD CONSTRAINT "score_lines_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "captain_sessions_team_idx" ON "captain_sessions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "leaderboard_snapshots_published_idx" ON "leaderboard_snapshots" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "master_sessions_email_idx" ON "master_sessions" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_order_unique" ON "rounds" USING btree ("round_order");--> statement-breakpoint
CREATE INDEX "rounds_state_order_idx" ON "rounds" USING btree ("state","round_order");--> statement-breakpoint
CREATE UNIQUE INDEX "score_lines_team_round_unique" ON "score_lines" USING btree ("team_id","round_id");--> statement-breakpoint
CREATE INDEX "score_lines_phase_team_idx" ON "score_lines" USING btree ("phase","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_team_round_unique" ON "submissions" USING btree ("team_id","round_id");--> statement-breakpoint
CREATE INDEX "submissions_round_idx" ON "submissions" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_captain_email_unique" ON "teams" USING btree ("captain_email");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_unique" ON "teams" USING btree ("name");