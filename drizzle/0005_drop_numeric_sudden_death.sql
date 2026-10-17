ALTER TABLE "sudden_death_answers" ALTER COLUMN "choice" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sudden_death_answers" DROP COLUMN "value";--> statement-breakpoint
ALTER TABLE "sudden_deaths" DROP COLUMN "answer";--> statement-breakpoint
ALTER TABLE "sudden_deaths" DROP COLUMN "unit";--> statement-breakpoint
-- A runaway query can never hold a connection for long during the event. Skipped (with a notice) if the host refuses it.
DO $$ BEGIN EXECUTE format('ALTER ROLE %I SET statement_timeout = %L', current_user, '8s'); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'statement_timeout not set: %', SQLERRM; END $$;
