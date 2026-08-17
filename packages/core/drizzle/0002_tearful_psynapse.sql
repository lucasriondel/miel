CREATE TYPE "public"."filter_suggestion_status" AS ENUM('pending', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TABLE "gmail_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"gmail_filter_id" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggested_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"criteria_from" text,
	"criteria_subject" text,
	"criteria_query" text,
	"add_label_id" uuid,
	"add_label_name" text NOT NULL,
	"reasoning" text,
	"status" "filter_suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_gmail_filter_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "gmail_filters" ADD CONSTRAINT "gmail_filters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_filters" ADD CONSTRAINT "suggested_filters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_filters" ADD CONSTRAINT "suggested_filters_add_label_id_labels_id_fk" FOREIGN KEY ("add_label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_filters_account_gmail_id" ON "gmail_filters" USING btree ("account_id","gmail_filter_id");--> statement-breakpoint
CREATE INDEX "suggested_filters_account" ON "suggested_filters" USING btree ("account_id","status");