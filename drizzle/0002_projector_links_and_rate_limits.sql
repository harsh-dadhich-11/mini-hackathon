CREATE TABLE "display_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL,
	"revoked_at" text
);
--> statement-breakpoint
ALTER TABLE "display_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" text NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD COLUMN "kind" text DEFAULT 'round' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "display_tokens_hash_unique" ON "display_tokens" USING btree ("token_hash");--> statement-breakpoint
UPDATE "leaderboard_snapshots" SET "kind" = 'stage' WHERE "label" IN ('Top 5 · Official scorecard', 'Top 2 · Finalists', 'Final result');
