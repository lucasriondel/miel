# Miel

Gmail triage tool. Fetches messages via the Gmail REST API, classifies them with an LLM (priority + label suggestions), and surfaces them in a local web UI for review/apply/reply.

## Language

**Attachment**:
A file carried by a Gmail message that the user would recognize as something to download — a PDF, doc, zip. Identified by its MIME part (filename, MIME type, Gmail attachment id, byte size), captured at sync time, stored alongside the message. Not the file bytes — only the metadata needed to list and later fetch it.
_Avoid_: File, document (those mean Drive files).

**Provider**:
Who runs one AI task: `claude-code` (the local `claude` subprocess, able to use tools mid-run) or a hosted vendor — `anthropic`, `google`, `openai` — called over HTTP against a fixed schema. Chosen per task (triage, reply, filter-suggest) in Settings, stored in `app_settings`, and named directly rather than parsed out of a model id: model ids are bare (`claude-haiku-4-5`). A Provider is not a model: one Provider offers several models, and the same model name can be reachable through more than one. The catalogue of providers and the models each serves is `packages/core/src/providerModels.ts`, which also holds the name each is shown under — the local one is displayed as "Claude Code", not "CLI" (#108), while its stored id stays `claude-code`.
_Avoid_: Vendor for the whole set (Claude Code is a provider and not a vendor), backend, integration, "the API" (ambiguous with miel's own HTTP API), `hosted-api` (the pre-#105 spelling for Anthropic).

**Provider credential**:
The secret that authorises miel to spend a user's quota at one LLM vendor, held as a single row in `encrypted_secrets` (named for the vendor) and encrypted at rest with `TOKEN_ENCRYPTION_KEY`. One per vendor, never per task: triage, reply and filter-suggest share that vendor's key. Claude Code deliberately has none — it authenticates with a Claude Code OAuth token handed to a subprocess, a different kind of secret with a different lifecycle. Set in the app (Settings → AI & Triage → Credentials), never in the environment, and only ever leaving `services/encryptedSecrets.ts` as a boolean or a masked hint (`sk-ant-…3f9`). See `docs/adr/0001-provider-credentials-in-postgres.md`.
_Avoid_: API key (too narrow — it names only the hosted case), token (means the Google refresh token or the Claude Code token elsewhere in this codebase).

**Claude Code token**:
The long-lived credential (`claude setup-token`) that lets the `claude` subprocess run without an interactive login. Not a Provider credential: it authorises a local CLI rather than an account at a vendor. It has one home, a row in `encrypted_secrets` under `claude_code.oauth_token` — it briefly had two, with `CLAUDE_CODE_OAUTH_TOKEN` as a fallback, and that exception is gone: the environment is not read, so a token nobody pasted does not exist. It only ever leaves `services/claudeCodeToken.ts` as a boolean and a masked hint (#109), the same shape a Provider credential's status has, and it is pasted where one is — Settings → AI & Triage → Credentials, on the Claude Code row (#110).
_Avoid_: Claude Code credential, OAuth token (means Google's), API key.

**Integration credential**:
The secret that authorises miel to reach an outbound integration it relays data *to*, as opposed to an inference vendor it buys tokens from. worp's API key is the only one today (#107). It shares the storage and the boundary rule of a Provider credential — a row in `encrypted_secrets`, encrypted with `TOKEN_ENCRYPTION_KEY`, set in the app (Settings → Integrations) and never in the environment, outward-visible only as a boolean plus a masked hint — but not the vocabulary: it authorises no model and belongs to no vendor catalogue, so a change to the provider list has nothing to do with it.

A **proxy header** is a near neighbour worth keeping distinct: the entries of worp's `extra_headers` map are credentials too (a Cloudflare Access service token is one), but they authenticate miel to whatever sits *in front of* the integration and are stripped at that edge — the integration itself never sees them. That is why they are one generic map rather than named Cloudflare fields.
_Avoid_: Provider credential (an integration is not an inference vendor), worp key (names the instance, not the concept), API key.

**Inline part**:
A MIME part with a filename that is embedded in the message body (a signature logo, an `<img>` referenced by `cid:` in the HTML) rather than offered for download. Inline parts are NOT Attachments and are filtered out at sync. The reliable test is a `Content-ID` that appears as `cid:<id>` in the HTML body — Content-Disposition is unreliable (real-world inline images are often tagged `disposition: attachment`).
_Avoid_: Embedded image, cid image.
