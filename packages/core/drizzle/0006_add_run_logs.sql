CREATE TYPE "public"."run_trigger" AS ENUM('manual', 'automatic');--> statement-breakpoint
CREATE TYPE "public"."triage_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "sync_windows" ADD COLUMN "trigger" "run_trigger" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE INDEX "sync_windows_started_at" ON "sync_windows" USING btree ("started_at");--> statement-breakpoint
CREATE TABLE "triage_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"sync_window_id" uuid,
	"trigger" "run_trigger" DEFAULT 'manual' NOT NULL,
	"status" "triage_run_status" DEFAULT 'running' NOT NULL,
	"candidates" integer DEFAULT 0 NOT NULL,
	"triaged" integer DEFAULT 0 NOT NULL,
	"suggested_new_labels" integer DEFAULT 0 NOT NULL,
	"failed_batches" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "triage_runs" ADD CONSTRAINT "triage_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_runs" ADD CONSTRAINT "triage_runs_sync_window_id_sync_windows_id_fk" FOREIGN KEY ("sync_window_id") REFERENCES "public"."sync_windows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "triage_runs_account_started" ON "triage_runs" USING btree ("account_id","started_at");--> statement-breakpoint
CREATE INDEX "triage_runs_started_at" ON "triage_runs" USING btree ("started_at");
