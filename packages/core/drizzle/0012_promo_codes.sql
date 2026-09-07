CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"code" text,
	"discount" text NOT NULL,
	"terms" text,
	"expires_at" timestamp with time zone,
	"merchant" text,
	"saved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subject" text,
	"from_name" text,
	"from_email" text,
	"internal_date" timestamp with time zone,
	"body_html" text,
	"body_text" text
);
--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_message_fk" FOREIGN KEY ("account_id","gmail_message_id") REFERENCES "public"."messages"("account_id","gmail_message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_codes_account_saved" ON "promo_codes" USING btree ("account_id","saved_at");--> statement-breakpoint
CREATE INDEX "promo_codes_saved_at" ON "promo_codes" USING btree ("saved_at");