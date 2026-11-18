CREATE TABLE "snoozes" (
	"account_id" uuid NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"gmail_message_id" text NOT NULL,
	"wake_at" timestamp with time zone NOT NULL,
	"snoozed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snoozes_account_id_gmail_thread_id_pk" PRIMARY KEY("account_id","gmail_thread_id")
);
--> statement-breakpoint
ALTER TABLE "snoozes" ADD CONSTRAINT "snoozes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "snoozes_wake_at" ON "snoozes" USING btree ("wake_at");