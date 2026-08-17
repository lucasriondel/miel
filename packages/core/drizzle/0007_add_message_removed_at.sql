ALTER TABLE "messages" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "messages_account_internal_date" ON "messages" USING btree ("account_id","internal_date");
