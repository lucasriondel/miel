CREATE TYPE "public"."priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'applied', 'dismissed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"gmail_label_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_labels" (
	"account_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "message_labels_account_id_gmail_message_id_label_id_pk" PRIMARY KEY("account_id","gmail_message_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"account_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text,
	"snippet" text,
	"body_text" text,
	"body_html" text,
	"internal_date" timestamp with time zone NOT NULL,
	"raw_headers" jsonb,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_trashed" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_account_id_gmail_message_id_pk" PRIMARY KEY("account_id","gmail_message_id")
);
--> statement-breakpoint
CREATE TABLE "suggested_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triage_id" uuid NOT NULL,
	"name" text NOT NULL,
	"reasoning" text,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_label_id" uuid
);
--> statement-breakpoint
CREATE TABLE "triage_label_suggestions" (
	"triage_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "triage_label_suggestions_triage_id_label_id_pk" PRIMARY KEY("triage_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "triages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"priority" "priority" NOT NULL,
	"reasoning" text NOT NULL,
	"claude_run_id" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_labels" ADD CONSTRAINT "suggested_labels_triage_id_triages_id_fk" FOREIGN KEY ("triage_id") REFERENCES "public"."triages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_labels" ADD CONSTRAINT "suggested_labels_created_label_id_labels_id_fk" FOREIGN KEY ("created_label_id") REFERENCES "public"."labels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_label_suggestions" ADD CONSTRAINT "triage_label_suggestions_triage_id_triages_id_fk" FOREIGN KEY ("triage_id") REFERENCES "public"."triages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_label_suggestions" ADD CONSTRAINT "triage_label_suggestions_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_account_gmail_id" ON "labels" USING btree ("account_id","gmail_label_id");--> statement-breakpoint
CREATE INDEX "labels_account_name" ON "labels" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX "messages_thread" ON "messages" USING btree ("account_id","gmail_thread_id");--> statement-breakpoint
CREATE INDEX "messages_internal_date" ON "messages" USING btree ("internal_date");--> statement-breakpoint
CREATE INDEX "triages_msg" ON "triages" USING btree ("account_id","gmail_message_id","created_at");