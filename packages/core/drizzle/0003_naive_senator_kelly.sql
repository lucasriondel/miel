CREATE TYPE "public"."sync_window_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "sync_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"range_from" timestamp with time zone NOT NULL,
	"range_to" timestamp with time zone NOT NULL,
	"query" text NOT NULL,
	"status" "sync_window_status" DEFAULT 'running' NOT NULL,
	"messages_fetched" integer DEFAULT 0 NOT NULL,
	"messages_new" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sync_windows" ADD CONSTRAINT "sync_windows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_windows_account_range" ON "sync_windows" USING btree ("account_id","range_from","range_to");