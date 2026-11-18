CREATE TYPE "public"."scheduled_send_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "compose_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_gmail_message_id" text,
	"payload" jsonb NOT NULL,
	"message_id_header" text NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"status" "scheduled_send_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"sent_message_id" text,
	"thread_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compose_uploads" ADD CONSTRAINT "compose_uploads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_sends" ADD CONSTRAINT "scheduled_sends_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compose_uploads_created_at" ON "compose_uploads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scheduled_sends_status_send_at" ON "scheduled_sends" USING btree ("status","send_at");--> statement-breakpoint
CREATE INDEX "scheduled_sends_account" ON "scheduled_sends" USING btree ("account_id","status");