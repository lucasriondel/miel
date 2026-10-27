DROP TABLE "suggested_filters" CASCADE;--> statement-breakpoint
DROP TABLE "suggested_labels" CASCADE;--> statement-breakpoint
DROP TABLE "triage_label_suggestions" CASCADE;--> statement-breakpoint
ALTER TABLE "triage_runs" DROP COLUMN "suggested_new_labels";--> statement-breakpoint
DROP TYPE "public"."filter_suggestion_status";--> statement-breakpoint
DROP TYPE "public"."suggestion_status";--> statement-breakpoint
DELETE FROM "app_settings" WHERE "key" IN ('filter.model', 'filter.provider');