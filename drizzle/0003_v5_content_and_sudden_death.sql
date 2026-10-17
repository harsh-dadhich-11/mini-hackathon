CREATE TABLE "sudden_death_answers" (
	"sudden_death_id" text NOT NULL,
	"team_id" text NOT NULL,
	"value" double precision NOT NULL,
	"submitted_at" text NOT NULL,
	CONSTRAINT "sudden_death_answers_sudden_death_id_team_id_pk" PRIMARY KEY("sudden_death_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "sudden_death_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sudden_deaths" (
	"id" text PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"question_key" text NOT NULL,
	"question" text NOT NULL,
	"answer" double precision NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"team_ids_json" text NOT NULL,
	"slots" integer NOT NULL,
	"carried_json" text DEFAULT '[]' NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"duration_seconds" integer NOT NULL,
	"opened_at" text NOT NULL,
	"closes_at" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sudden_deaths" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "context" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "lead_hat" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "principle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "others_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "follow_up" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sudden_death_answers" ADD CONSTRAINT "sudden_death_answers_sudden_death_id_sudden_deaths_id_fk" FOREIGN KEY ("sudden_death_id") REFERENCES "public"."sudden_deaths"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sudden_death_answers" ADD CONSTRAINT "sudden_death_answers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sudden_deaths_created_idx" ON "sudden_deaths" USING btree ("created_at");