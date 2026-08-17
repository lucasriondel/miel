-- #105: a provider is now a vendor name, and a model id is bare.
--
-- `hosted-api` could only ever have meant Anthropic — the single-vendor hosted
-- path threw on every other model prefix — so the rewrite is lossless.
UPDATE "app_settings"
SET "value" = 'anthropic', "updated_at" = now()
WHERE "key" IN ('triage.provider', 'reply.provider', 'filter.provider')
  AND "value" = 'hosted-api';
--> statement-breakpoint
-- Model ids used to carry the vendor as a prefix (`anthropic/claude-haiku-4-5`);
-- the vendor is named by the provider setting now, so the prefix goes.
UPDATE "app_settings"
SET "value" = regexp_replace("value", '^[^/]+/', ''), "updated_at" = now()
WHERE "key" IN ('triage.model', 'reply.model', 'filter.model')
  AND "value" LIKE '%/%';
