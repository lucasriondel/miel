# Data model

Schema: `packages/core/src/db/schema.ts`. Migration rules: `CODING_STANDARDS.md` → *Migrations*.

- `accounts` — connected Gmail accounts (email, profile, encrypted OAuth `refresh_token`, granted scopes, `connected_at`).
- `labels` — Gmail labels per account (synced).
- `messages` — fetched Gmail messages (PK: `accountId + gmailMessageId`). Bodies stored as text + html.
- `message_labels` — join.
- `triages` — one row per Claude triage run per message (priority + reasoning + model/runId).
- `triage_label_suggestions` — existing labels Claude suggests (status: pending/applied/dismissed).
- `suggested_labels` — *new* labels Claude proposes that don't exist yet.
- `promo_codes` — one discount code extracted from a marketing mail, keyed back to it. Two states on one row: suggested and saved (`saved_at`). The save also writes six denormalised copies of the mail (subject, sender name/address, `internal_date`, HTML and stripped text), which is what makes a saved promo outlive the Gmail original it trashes. `expires_at` is stored at end-of-day UTC and treated as a date (`promoExpiry.ts`), never an instant.
- `app_settings` — KV for model picks etc. (see `services/settings.ts`).
- `encrypted_secrets` — every secret that is not a Gmail refresh token, one row per secret, AES-256-GCM ciphertext: vendor API keys (named for the vendor), worp's key and proxy headers, and the Claude Code token (dotted names).
