CREATE TABLE "contacts" (
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"times_contacted" integer DEFAULT 1 NOT NULL,
	"last_contacted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contacts_account_id_email_pk" PRIMARY KEY("account_id","email")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_account_last" ON "contacts" USING btree ("account_id","last_contacted_at");