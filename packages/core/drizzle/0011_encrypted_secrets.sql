-- #107: worp's API key and its proxy header map need the same encrypted-at-rest
-- storage #104 built for LLM vendor keys. Rather than stand up a second table
-- with identical columns, the existing one is generalised: the PK stops being
-- "a vendor name" and becomes "a secret's name", with vendors and dotted
-- integration keys (`worp.api_key`, `worp.extra_headers`) sharing it.
--
-- A rename, not a copy: the existing rows are already valid under the wider
-- key, so no data moves and no key is re-encrypted.
ALTER TABLE "provider_credentials" RENAME TO "encrypted_secrets";
--> statement-breakpoint
ALTER TABLE "encrypted_secrets" RENAME COLUMN "provider" TO "name";
--> statement-breakpoint
ALTER TABLE "encrypted_secrets" RENAME COLUMN "encrypted_key" TO "encrypted_value";
