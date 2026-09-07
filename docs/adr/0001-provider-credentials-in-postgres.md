# 1. Provider credentials live in Postgres, not the environment

- Status: accepted
- Date: 2026-08-12
- Issue: [#104](https://github.com/lucasriondel/miel/issues/104)

## Context

miel can run each AI task (triage, reply, filter-suggest) through one of two
providers, chosen per task in Settings: the local `claude` CLI (`claude-code`)
or Anthropic's hosted API (`hosted-api`). The choice is a row in `app_settings`
— a runtime setting, changed in the UI, effective immediately.

The credential that choice needs was not. `ANTHROPIC_API_KEY` was an env var
read through `getEnv()`, which made the picker a half-lie: selecting **Hosted
API** in the UI did nothing until someone edited `.env` and restarted the API —
on the deployed instance, a redeploy. A setting whose effect requires shell
access to the server is not a setting.

We already store one long-lived bearer credential in Postgres: the Google OAuth
refresh token, encrypted with AES-256-GCM under `TOKEN_ENCRYPTION_KEY`
(`packages/core/src/util/crypto.ts`, formerly `google/tokenCrypto.ts`). That
machinery is credential-agnostic; only its filename said otherwise.

## Decision

Store LLM provider API keys in Postgres, encrypted at rest with the same
mechanism as the refresh token.

- A `provider_credentials` table: `provider` (PK), `encrypted_key`,
  `created_at`, `updated_at`. **One row per vendor**, not per task — an API key
  is issued per vendor, so triage, reply and filter-suggest share it.
- `packages/core/src/services/providerCredentials.ts` is the only module that
  decrypts. Outward callers (API routes, CLI, UI) get a
  `ProviderCredentialStatus`: a boolean and a masked hint (`sk-ant-…3f9`).
  `readProviderCredentialEffect` returns the plaintext and is deliberately not
  re-exported from `packages/core/src/index.ts`; the hosted-api provider imports
  the service module directly.
- `ANTHROPIC_API_KEY` is removed from `env.ts`, `.env.example` and
  `docker-compose.yml`.

## Consequences

**No auto-import from the environment.** A migration that read
`ANTHROPIC_API_KEY` once and wrote it into the table would have been convenient
and is exactly the behaviour that makes a secret's location unknowable: the env
var would keep working for one deploy, silently stop mattering, and leave a
copy in the deployment config that looks live. The key is pasted once, in the
UI, and there is one place it lives afterwards.

**There is a window with no credential.** After a fresh deploy, nothing is
stored until someone pastes a key. If `schedule.enabled` is on and a task's
provider is `hosted-api`, those runs fail during that window rather than
skipping quietly — a failed run in the logs is the correct signal for "the
operator has not finished setting this up". Accepted.

**`TOKEN_ENCRYPTION_KEY` now protects two kinds of secret.** Rotating it
without re-encrypting invalidates stored provider keys as well as refresh
tokens. A credential whose blob will not decrypt is reported as present with no
hint (rather than as absent), so the UI tells the operator to re-paste instead
of implying nothing was ever set.

**Masking, not truncation, is the outward form.** The hint is the first seven
characters and the last three; anything shorter than fourteen characters gets no
hint at all, so the hint can never be most of the secret.

> Follow-up, [#113](https://github.com/lucasriondel/miel/issues/113): the
> privacy policy stated the first half of that and not the second, which is
> false for a key between the minimum length a save accepts (eight) and the
> minimum a hint needs (fourteen). The masking is unchanged; the copy was
> corrected, and the function and its constants moved to the leaf
> `credentialMasking.ts` so the page imports them rather than restating them.

**Scope stops at the mechanism.** Anthropic stays the only hosted vendor.
Widening to Google and OpenAI is a follow-up: it needs new rows and new model-id
prefixes, not new credential machinery. Keeping the halves apart means the
security-sensitive change was reviewed on its own.

> Follow-up, [#105](https://github.com/lucasriondel/miel/issues/105): that
> widening happened. `CREDENTIAL_PROVIDERS` is now `anthropic`, `google`,
> `openai`, and the provider setting names the vendor directly instead of it
> being read out of a model-id prefix — `hosted-api` no longer exists as a
> stored value. The machinery this ADR describes was not changed: still one row
> per vendor, still one decrypting module, still no auto-import from the
> environment.

> Follow-up, [#107](https://github.com/lucasriondel/miel/issues/107): the same
> argument was made for the worp relay's credentials, so the table this ADR
> introduces was generalised rather than duplicated. `provider_credentials`
> became `encrypted_secrets` (migration `0011`), its PK `provider` became a
> plain `name`, and `services/providerCredentials.ts` became
> `services/encryptedSecrets.ts`. A vendor key is still one row named for the
> vendor; worp's key and proxy headers are rows named `worp.api_key` and
> `worp.extra_headers`. Every property this ADR argues for is unchanged: one
> decrypting module, a boolean-plus-masked-hint outward, no auto-import from the
> environment. The one thing worth naming is that the table is no longer
> self-describing — a row's meaning now depends on its name, which is why those
> names are constants in `worpConfig.ts` and `credentialProviders.ts` rather
> than string literals at call sites.

> Follow-up, [#109](https://github.com/lucasriondel/miel/issues/109): the Claude
> Code token now gets the same treatment, as another row in the table #107
> generalised — named `claude_code.oauth_token` rather than for a vendor, since
> it authorises a local CLI and not an account at a vendor. Same crypto, same
> masking, same single-decryptor rule (`services/encryptedSecrets.ts`). It
> departed from this ADR in one place, on purpose:
> `CLAUDE_CODE_OAUTH_TOKEN` stayed readable as a *fallback* when nothing was
> stored, on the argument that the ambiguity was answered by making the source
> part of the status the UI shows, and that the alternative was taking triage
> away from every existing deployment on upgrade.
>
> **That exception is now gone.** The store is the only source: the environment
> variable is not read, not as a fallback and not when the store cannot be
> reached, and the status no longer carries a `source` because there is only one.
> A transitional exception is worth keeping only while it is transitional, and
> two things had gone wrong with this one. The narrow one is that it was
> load-bearing without anyone choosing it: an operator who had never opened
> Settings was triaging on an env var they had set for a previous version, and
> the app reported itself configured, which is precisely the "a secret nobody
> can find" failure this ADR was written against — deferred by one release
> rather than avoided. The broader one is that it was the last AI credential
> with two homes, so every document describing miel's credentials had to carry
> an exception clause, and every reader had to hold "except this one" in mind.
> Making the rule exceptionless costs one manual paste per existing deployment,
> once, against a permanently simpler thing to reason about.
>
> The read path no longer degrades to the environment when the secret store is
> unreachable either. That degradation existed to protect the env fallback; with
> nothing to fall back to, answering "no token" on a database blip would report
> a missing credential to an operator who has one, and invite them to paste it
> again over a store that cannot hold it. It fails instead.

## Alternatives considered

- **Keep the key in env, hide the picker unless it is set.** Honest, and it
  makes the hosted provider unreachable for anyone who cannot restart the
  server — which is most self-hosters after the first deploy.
- **Encrypt with a per-row key wrapped by a KMS.** Correct at a scale miel does
  not operate at; it would add a cloud dependency to a tool that currently needs
  Postgres and nothing else.
- **Store the key in `app_settings` alongside the picker.** Simplest diff, and
  it puts a plaintext secret in a table whose entire purpose is to be read and
  rendered — `GET /settings` would have leaked it on day one.
