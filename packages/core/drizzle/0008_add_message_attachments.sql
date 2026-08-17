CREATE TABLE "message_attachments" (
	"account_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "message_attachments_account_id_gmail_message_id_attachment_id_pk" PRIMARY KEY ("account_id","gmail_message_id","attachment_id")
);
--> statement-breakpoint
CREATE INDEX "message_attachments_message" ON "message_attachments" USING btree ("account_id","gmail_message_id");
