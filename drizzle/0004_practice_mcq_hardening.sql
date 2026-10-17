ALTER TABLE "login_codes" ADD COLUMN "challenge_id" text;--> statement-breakpoint
ALTER TABLE "sudden_death_answers" ADD COLUMN "choice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sudden_deaths" ADD COLUMN "options_json" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "sudden_deaths" ADD COLUMN "correct_option" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sudden_deaths_one_open" ON "sudden_deaths" USING btree ("state") WHERE state = 'open';