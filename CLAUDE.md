# Miel

Gmail triage tool. Fetches messages via the Google Gmail REST API (`googleapis`), classifies them with Claude (priority + label suggestions), and surfaces them in a local web UI for review/apply/reply.

## Stack

- Runtime: **Bun 1.3** (set in `package.json`'s `packageManager`). Use `bun` for installs and scripts, not npm/pnpm.
- Monorepo: **Turborepo** with Bun workspaces under `packages/*`.
- Language: TypeScript (ES2022, strict, bundler resolution — see `tsconfig.base.json`).
- DB: **Postgres 16** via Docker, accessed with **drizzle-orm** + `postgres` driver. Schema in `packages/core/src/db/schema.ts`, migrations in `packages/core/drizzle/`.
- API: **Hono** on Bun.serve.
- Web: **React 19 + Vite 8 + Tailwind 4 + TanStack Query 5 + React Router 7**. Tailwind 4 means CSS-first config: no `tailwind.config.js`, `packages/web/src/index.css` is the entry (`@import "tailwindcss"` then the vendored gousse sheets, whose `@theme` block defines the tokens), and `@tailwindcss/vite` does the scanning.
- Google APIs: **googleapis** + **google-auth-library** (in-app OAuth, per-account refresh tokens stored in Postgres). Effect services in `packages/core/src/google/*` wrap each Gmail resource.
- Validation: **Zod** everywhere (env, API I/O, Claude/Gmail JSON).

## Packages

- `@miel/core` — env, db client + schema, Zod schemas, tagged-error taxonomy (`errors.ts`), Effect Google services (`google/*`: `GoogleAuth`, `GmailMessages`/`Labels`/`Filters`/`Threads`/`Modify`/`Profile`), the Claude service (`claude/*`, `claude -p` + the stored Claude Code token), the `shell` adapter, and business services (`sync`, `apply`, `messages`, `reply`, `accounts`, `labels`, `settings`). Everything else depends on this.
- `@miel/api` — Hono HTTP API. Routes in `src/routes/*` thinly wrap core services. Bearer auth via `API_SECRET`.
- `@miel/web` — Vite SPA. Talks to the API through `/api` (Vite dev proxy → `API_PORT`).
- `@miel/cli` — `miel` Commander CLI for sync/accounts/apply/reply/db ops. Useful for headless runs and smoke tests.
- `@miel/landing-page` — the public site at the root of the deployed host (home, `/privacy`, `/terms`). TanStack Start prerendered to static HTML, styles inlined, no JavaScript and no external assets in the output. Depends on `@miel/core` only, through leaf subpaths (`@miel/core/googleScopes`, `@miel/core/claudeUsage`, `@miel/core/appBasePath`), so its build pulls in none of core's db or env code. Ships as its own nginx image (`packages/landing-page/Dockerfile`); `src/deploy/topology.ts` holds the path split between it and `@miel/web`. Dev server on 5200, strict-port.

## Design system (the gousse-ui registry)

UI primitives come from **gousse-ui**, consumed as a **shadcn registry**, not as an npm package. The registry copies source into this repo: `packages/web/components.json` points the `@gousse` namespace at `https://lucasriondel.github.io/gousse-ui/r/{name}.json` (GitHub Pages, public, no auth) and holds the `@/` aliases the copied files land under — components in `packages/web/src/components/ui/`, registry libs in `src/lib/gousse/`, the three stylesheets in `src/styles/gousse/`. App code imports one module per primitive through the `@/` alias (`@/components/ui/button`), never a barrel. Nothing in this repo resolves from an authenticated npm registry any more (#74), so `bun install` needs no credentials of any kind — no token, no per-scope config.

The maintenance consequence, which is easy to be surprised by: **vendored components never update through `bun install`** — there is no version to resolve, and a copied file is ours. An upstream gousse-ui fix reaches miel only when someone re-runs the add for that item and reviews the resulting diff:

```bash
cd packages/web
bunx shadcn@latest add @gousse/button   # overwrites the vendored copy in place
git diff src/components/ui/button.tsx   # review: local edits are yours to keep or re-apply
```

`packages/web/DESIGN.md` §10 has the rest — which primitives are vendored, the pinned Base UI prerelease that two of them need, and the stylesheet load order.

## External binaries (must be on PATH or set via env)

- `CLAUDE_BIN` (default `claude`) — Claude Code CLI invoked headlessly by `claude/Claude.ts` for triage and reply generation, with the stored Claude Code token injected into the subprocess env (no interactive login). Gmail I/O has no external binary — it's done in-process via `googleapis`.

## Running locally

```bash
# 1. Boot Postgres
docker compose -f docker-compose.dev.yml up -d

# 2. Install deps (public registries only — no token, no auth setup)
bun install

# 3. Dev — runs api (3001) + web (3000) only; see root package.json
bun dev
```

The API applies pending drizzle migrations on boot (`runMigrations()` in `packages/api/src/index.ts`) and exits non-zero if they fail, so there is no manual migrate step in dev or in Docker. To run them standalone anyway: `bun run --env-file=.env packages/core/src/db/migrate.ts`.

The root `bun dev` is scoped to `@miel/api` + `@miel/web` deliberately; core/cli don't have long-running dev tasks. The landing page is independent of both — run it on its own with `cd packages/landing-page && bun run dev` (http://localhost:5200, fails loudly if the port is taken). `bun run build` at the root does build it, since the container needs its prerendered output.

The web app is served under the `/app` path prefix (`APP_BASE_PATH` in `packages/core/src/appBasePath.ts` — Vite's `base`, the router's `basename`, and nginx's SPA fallback all derive from it), so in dev it's at http://localhost:3000/app. The `/api` proxy sits outside the prefix: the app must reach its API same-origin.

CLI examples:

```bash
cd packages/cli
bun run src/index.ts accounts list          # list connected accounts in the db
bun run src/index.ts sync --since 7d        # fetch + triage
bun run src/index.ts apply <messageId> ...  # apply suggestions
```

## Environment

`.env` at repo root is the single source of truth — loaded by `bun run --env-file=../../.env` (api/cli) and by Vite via `envDir: '../..'`. See `.env.example`. Required keys: `DATABASE_URL`, `CLAUDE_BIN`, `API_SECRET`, `API_PORT`, `WEB_PORT`, `VITE_API_BASE`, `VITE_API_SECRET`, plus the Google OAuth set (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`) and `TOKEN_ENCRYPTION_KEY` (required in prod). No AI credential is an env var — not a vendor key and, since the fallback was dropped, not `CLAUDE_CODE_OAUTH_TOKEN` either; setting one does nothing, because nothing reads it. `VITE_API_SECRET` must match `API_SECRET` (web sends it as a bearer token).

Env is parsed/validated once via `getEnv()` in `packages/core/src/env.ts`.

How an operator *gets* the three Google values is one walkthrough rather than
three (#138). `packages/core/src/googleOAuthSetup.ts` is a leaf module beside
`claudeUsage.ts` — the ordered steps as data, plus the callback path the API
route mounts and the dev redirect URI `env.ts` defaults to, so what the
documents tell someone to register is what an unconfigured server actually
sends Google. Two surfaces render that list: the onboarding gate's first step
(`GoogleOAuthSteps.tsx`, the one screen a fresh install reaches before it can
do anything) and the landing page's installation guide, whose `GuideStep` gained
a `substeps` field for it. The README is the third and the only one allowed to
restate them, in Markdown of its own; `contributorDocs.test.ts` checks its
section against the same list. Console labels, the consent screen's mode and a
redirect URI are precisely the facts that get fixed in one document out of
three.

One deploy-time key sits outside that schema: `SITE_HOST`, the public hostname the
landing container (`/`), the app (`/app`) and the API proxy (`/api`) share. It is
read by `packages/landing-page/src/deploy/topology.ts` — deployment data the tests
and DEPLOY.md are checked against, not runtime code — and defaults to the
reference deployment's host, so hosting miel elsewhere means setting it rather
than editing source (#99).

## Data model (high level)

- `accounts` — connected Gmail accounts (email, profile, encrypted OAuth `refresh_token`, granted scopes, `connected_at`).
- `labels` — Gmail labels per account (synced).
- `messages` — fetched Gmail messages (PK: `accountId + gmailMessageId`). Bodies stored as text + html.
- `message_labels` — join.
- `triages` — one row per Claude triage run per message (priority + reasoning + model/runId).
- `triage_label_suggestions` — existing labels Claude suggests (status: pending/applied/dismissed).
- `suggested_labels` — *new* labels Claude proposes that don't exist yet.
- `app_settings` — KV for model picks etc. (see `services/settings.ts`).
- `encrypted_secrets` — every secret that is not a Gmail refresh token, one row per secret, value AES-256-GCM ciphertext: an LLM vendor's API key (named for the vendor), worp's key and proxy headers, and the Claude Code token (dotted names). See below.

## Migrations

A migration is two files, not one. `packages/core/drizzle/NNNN_*.sql` is what the
migrator applies; `packages/core/drizzle/meta/NNNN_snapshot.json` is the schema
state it left behind, and it is what `drizzle-kit generate` diffs the *next*
change against. Nothing at runtime reads a snapshot — the migrator reads
`meta/_journal.json` and the SQL — which is why the two can drift for six
migrations without a single failure, and did (#122): 0006…0011 were hand-written
with no snapshot beside them, so `generate` still saw the 0005 baseline and the
next generated file would have re-created six migrations' worth of objects.

So: `bunx drizzle-kit generate` from the repo root, which writes both. A
migration that has to be hand-written (a data rewrite like `0010`, a rename the
prompt gets wrong) still needs its snapshot written by hand — a snapshot is a
pure serialization of the schema state, so it is the previous one plus that
migration's effect, chained by `prevId` → the predecessor's `id`.
`packages/core/src/db/migrationSnapshots.test.ts` is the guard: the journal, the
SQL and the snapshots must list the same migrations, each snapshot must name the
one before it, and the newest must be `schema.ts` table for table — which is
`generate` producing an empty migration, asserted in-process and with no
database.

## Providers

Each of the three AI tasks (triage, reply, filter-suggest) runs through a
provider chosen in Settings: `claude-code` (the local `claude` subprocess) or
one of the hosted vendors — `anthropic`, `google`, `openai` — over HTTP through
the Vercel ai-sdk (#105). The catalogue is `packages/core/src/providerModels.ts`,
a leaf module: which providers exist, each one's curated model list, and its
default. The API validates a save against it and the web pickers are built from
it, so there is one list rather than three.

`DEFAULT_PROVIDER` in that module is `claude-code`, and `SETTING_DEFAULTS` is
built from it, so a fresh install with no settings row triages, replies and
suggests filters through the local CLI before anyone opens Settings (#112). Two
consequences the docs have to keep saying: a Claude Code token is required
unless the operator switches provider first, and it has to be pasted in Settings
because there is no env var that supplies one; and no copy may claim an install
is inert until a provider is picked — the provider is already picked, so the
only thing standing between a fresh install and outbound mail is that
credential.
`contributorDocs.test.ts` and the landing page's `guide.test.ts` check both
against that constant.

Model ids are bare (`claude-haiku-4-5`), never `vendor/model` — the vendor is
the provider, named directly, because the credential lookup is keyed by vendor.
Migration `0010` rewrites the pre-#105 spellings (`hosted-api` → `anthropic`,
prefix stripped off model ids) and `normalizeModelSettings` does the same on
read, so a row an old build wrote still resolves.

The two transports stay distinct on purpose, and both live in
**`ai-task-runner-effect`** now — the extracted, generic runner package
(`~/dev/perso/ai-task-runner-effect`, on npm), which composes
**`claude-code-effect`** for the CLI transport (`claude -p`, `--allowedTools`,
a real session id) and the Vercel ai-sdk for the hosted one (one
schema-constrained HTTP call, no tools). Its `makeTaskRunner(table, deps)`
holds the one hosted-vs-CLI branch and takes miel's two answers as a contract:
`resolve` is `resolveTaskProviderEffect`, `credential` reads the vendor's key
out of `encrypted_secrets` (`Redacted`, unwrapped only at the call that spends
it). It is a factory, not a tag, so the injection seam stays miel's own (#133).
Triage still has two prompts — the hosted one drops the "curl the body from
the local API" paragraph, which it has no tool to act on and which would post
`API_SECRET` to a third party. Neither prompt inlines a body; `claudeUsage.ts`
publishes what triage sends and the landing page derives its disclosure from it.

What differs per task is data, and the branch between those two transports is
written once (#128). `claude/tasks.ts` is the table — one row per `ModelTask`
in the package's `TaskSpec` shape: the output contract as an `ObjectCodec`
(`zodCodec` wraps each Zod schema — the JSON Schema both transports constrain
the model with, and a decode failing with miel's own `ClaudeSchemaError`), the
CLI prompt builder, the hosted prompt builder, the one-line hosted instruction
and the tools the CLI may use — and the service is a single `run(task, input)`
returning that task's typed output. Three methods used to spell the same four
steps out with different nouns, so the fourth task would have been the fourth
copy of the transport `if`; now it is a row, which
`satisfies Record<ModelTask, …>` makes mandatory rather than aspirational. The
two prompt columns are the part not to collapse: a task whose builders happen
to match lists the same one twice, on purpose, so nothing can quietly hand the
CLI prompt — the one carrying `API_SECRET` — to a vendor.

What stays in `claude/Claude.ts` is everything that is a miel decision: the
token's source, the auth heuristic (`looksLikeAuthProblem`), and the mapping of
the runner's and the SDK's structural failures onto miel's own taxonomy — the
runner's `TaskNotRunnableError` (its key-deleted race guard) becomes the
resolver's `ProviderNotRunnableError` so a boundary cannot tell the two apart,
its `HostedApiError`/`TaskSchemaError` become miel's `HostedApiError`, and the
CLI tags map as they did when the transport was inline. Tests fake both
transports at their real seams: `_setCommandExecutorLayerForTests` (the SDK's
`ClaudeCodeTest.handler`) for the CLI, `_setHostedGenerateForTests` (the
runner's `HostedGenerate`) for the hosted call — `claude/hosted.test.ts` runs
the whole hosted path, real credential decryption included, with no network
and no module mocks.

That service is also the only place a fake goes in (#133). `Claude`, the Effect
tag in `claude/Claude.ts`, is the single injection seam: triage, reply and
filter-suggest all `yield* Claude`, the boundaries provide `ClaudeLive`, and a
suite provides a `ClaudeImpl` through `Layer.succeed(Claude, …)` —
`testkit/claude.ts` is the one fake, and no test mocks the module. There used to
be two seams with a pure pass-through between them: sync owned a `ClaudeService`
whose only production adapter re-wrapped a promise facade over this very tag, so
sync's suites faked one end and the service's own tests the other. `run` carries
no requirement of its own, which is what lets a caller state `Claude` and
nothing else; the stores the live implementation reads — provider, model,
credential — ride in `ClaudeLive`'s `R` and are captured when the layer is
built, so production still cannot construct it without them.
`claude/seam.test.ts` guards the shape, because a second wrapper would compile
and pass every behaviour test.

Nothing falls back. A vendor that has no key, or rejects the one it has, fails
the run — the user chose which vendor sees their mail. Which of those two it was
is answered before the transport runs (#125): `Claude.ts` asks
`resolveTaskProvider(task)` for the provider and model instead of reading
settings, so a hosted vendor with no stored key fails as
`ProviderNotRunnableError` before a socket is opened, and `HostedApiError` means
only "the vendor call failed". The hosted provider's key read is now a race
guard — the key deleted between the check and the read raises the same
`ProviderNotRunnableError`, so the classification does not depend on timing.
Both failures stay visible: `HostedApiError` carries its reason in `detail`,
already scrubbed of the key where the key is known, and the API maps it to
`hosted_api_error` (502) with that detail as the message (#116); a run-phase
`ProviderNotRunnableError` maps to `claude_unavailable` (503), the family a
missing Claude Code token is in, carrying the reason, task and vendor and no
prose. The sentence that sends a user to Settings lives at the edges that show
it — the sync toast and `apiErrorMessage` — never in a core error, since the
resolver checks the model too and one message could not fit both reasons.

Who counts as "unavailable" is the taxonomy's answer, not each caller's (#126).
`errors.ts` owns the union `ProviderUnavailableError` — no Claude Code token, a
token the CLI rejected, a task pointed at a vendor with no key — plus the
predicate `isProviderUnavailable` and the derived tag set every boundary reads.
The set is built from a record keyed by the union's own `_tag`, so a fourth way
to be unavailable is one edit to that file and nothing else compiles until it is
listed. Five places used to spell the two Claude tags out — the triage catch, the
filter-suggest catch, the sync-all loop, the API error middleware and the sync
WebSocket — and none had learned the third, so a keyless hosted vendor burned
every batch as a non-fatal failure while the identical condition for claude-code
stopped the run with a toast. Now sync's two catches share one combinator
(`sync/providerFailure.ts`): unavailable propagates, everything else is this
batch's problem and the run continues. A run that hits it stops the account loop,
emits one `sync.provider_unavailable` and records one failed run — the credential
and the provider pick are global, so every remaining account would fail the same
way. Note what stays outside the union: `HostedApiError` is the vendor having
answered and failed, which is one batch's problem, not the install's.

That event was `sync.claude_unavailable` until #127, when the name stopped being
true: it fires for a keyless OpenAI too. Renaming something that travels over the
sync socket costs one release of overlap, and the split is in
`schemas/syncEvents.ts` — the server emits `SyncServerEvent`, which carries only
the new name, and the client parses `ReceivedSyncServerEvent`, which also accepts
the old literal so a page loaded from this release still understands a
not-yet-redeployed API. **Removable next release**: the alias schema, the
`ReceivedSyncServerEvent` union it is the only reason for, and the extra `case`
in the web client's `dispatchEvent`. The HTTP error code is a different surface
and keeps its name: a refusal on the run path is still `claude_unavailable` (503).

## Provider credentials

The API key for a hosted provider is **not** an env var. It lives in
`encrypted_secrets` under the vendor's name, encrypted with
`TOKEN_ENCRYPTION_KEY` (the same `util/crypto.ts` that protects Google refresh
tokens), and is pasted in the app under Settings → AI & Triage → Credentials,
which since #110 holds one row per provider — the three vendor keys and the
Claude Code token, which is the same kind of setting and no longer a separate
read-only subsection. The provider picker is a runtime setting, so its
credential is one too —
`docs/adr/0001-provider-credentials-in-postgres.md` has the decision and what it
costs.

The boundary rule is the part to keep intact: `services/encryptedSecrets.ts`
is the only module that decrypts. Everything outward — API routes, CLI, UI —
gets a `ProviderCredentialStatus` (a boolean plus a masked hint like
`sk-ant-…3f9`). The shape of that hint lives in
`packages/core/src/credentialMasking.ts`, a leaf module beside `claudeUsage.ts`
for the same reason: first 7 characters, last 3, and no hint at all below 14
characters, where it would be most of the key. The privacy page imports those
constants instead of describing them, so the promise it makes cannot drift from
the function (#113) — including the part that is easy to overstate, that a key
short enough to save and too short to hint at gets a bare ellipsis.
`readProviderCredentialEffect` returns the plaintext and is
deliberately absent from `packages/core/src/index.ts`; `claude/Claude.ts`
imports the service module directly and hands the key to the runner `Redacted`,
so it is unwrapped only inside the hosted transport at the call that spends it.
Nothing logs a key: `createDebug` sees the vendor name and booleans, a rejected
key is described by a reason code rather than quoted, and vendor SDK error
messages are scrubbed of the key before they become a `HostedApiError`.

There is no auto-import from the environment, so after a deploy there is no
credential until someone pastes one. Selecting a hosted provider before its key
exists is refused by the settings route rather than saved and left to fail on
the next sync, and the model row asks for the key in place so the two are one
action.

In the web app one hook owns a credential's whole lifecycle:
`packages/web/src/api/useCredential.ts` (#135). It takes a `Provider` — any of
the four — and answers the same shape for each: configured, hint, loading,
saving, clearing, error, the draft being typed, save and clear. The branch it
hides is which endpoint the credential lives behind (a vendor's
`/settings/provider-credentials/<vendor>`, the local provider's
`/settings/claude-code-token`), so nothing above it asks "is this provider
hosted?" to find out which pair of hooks to call, and the ladder that decides
which failure the user is shown — the save's, then the clear's, then the
read's — exists once. `features/settings/CredentialTile.tsx` is the one tile
all four get and `credentialCopy.ts` the few words they differ in.

The invariant is "a hosted provider is never selected without a credential",
not "a save names one", so all the doors into it are shut (#117): deleting the
key of a vendor a task is pointed at is refused, and the credential check runs
on any patch that touches a task — a model-only edit resolves its vendor from
the stored row and is checked against that. All three refusals answer 400 with
the same `missing_provider_credential` body naming the task and the vendor.

Since #124 that rule is core's, not the route's: `services/taskProviders.ts`
owns it. A pure kernel (`taskProviderProblem` plus the two `reject*` functions)
takes a patch, what is stored and the *set of vendors that have a key* — booleans,
never a key — and answers with a `ProviderNotRunnableError` or null; the checked
facades `checkedUpdateModelSettings` and `checkedDeleteProviderCredential` run it
before writing, so a two-task patch with one bad half is refused whole; and
`resolveTaskProvider(task)` answers which provider and model a task runs on, or
why it cannot. It composes `settings.ts` and `encryptedSecrets.ts` and neither
imports it back. The settings route now only calls the facades, and the API's
error middleware maps the tagged error to the same 400 bodies as before — so the
CLI and the scheduler, which never touch that route, get the rule too. Two things
it deliberately does not check: `claude-code`, always runnable at save time
because its token is a run-time concern and the shipped default points at it
before anyone has pasted one; and `setSetting(key, value)`, the raw key-value
writer, which stays an operator escape hatch with no check at all.

Since #125 the resolver is also on the run path, which is why the refusal
carries a `phase`. Both halves of the rule are the same check — the doors ask it
about a patch, `Claude.ts` asks it about the task it is about to run — but they
are not the same news to a caller: `save` is an edit being rejected while the
user is looking at the picker (400, the reason code as the `error` field), `run`
is an install discovering it cannot do the work (503 `claude_unavailable`).
The consequence to know: the model half now gates runs too, so a model id no
provider serves — reachable only through `setSetting` or a catalogue entry that
was dropped — stops the task instead of being passed to the CLI.

## The worp integration

miel can relay a message's PDF attachment to a worp instance for
auto-invoice-filing. Its configuration is a runtime setting, not
environment (#107), for the reason the provider key above is: pointing miel at a
different worp used to mean editing `.env` and redeploying.

Three parts, split by whether they are secret. `worp.base_url` sits in
`app_settings`; `worp.api_key` and `worp.extra_headers` are rows in
`encrypted_secrets`. `services/worpSettings.ts` is the seam that hides the
split — the API route and the UI see one "worp settings" object — while
`services/encryptedSecrets.ts` stays the only module that decrypts, and
`sendToWorp.ts` the only one that reads the plaintext.

The gate is total and up-front: no base URL or no key means
`WorpNotConfiguredError` before a socket is opened, and the route answers
`worp_not_configured` (503). Since nothing is imported from the environment,
that is the fresh-install default rather than a rarity — the attachment UI hides
the action until the server reports `configured`.

For that gate to mean anything the key has to be plausible, so `worp.api_key` is
held to the same `MIN_KEY_LENGTH` as every other secret (#118) — checked in
`UpdateWorpSettingsRequest` and again in the setter, which is now
`setSecretEffect` under a name. The one exception is the empty string: it is not
a short key but the UI's other way of saying "clear it", so the minimum applies
above it. `worpSettings.ts` runs the check itself, before it writes anything, so
a patch carrying a bad key is refused whole rather than after the base URL beside
it landed; that refusal is an `InvalidWorpSettingsError` with `field: "apiKey"`
and the shared `too_short` reason, because a caller patching named fields needs
to know which one was refused.

`extra_headers` is a generic header-name→value map, not named Cloudflare
fields. A CF Access service token is validated and stripped by CF at the edge,
so worp only ever sees its own bearer: these are transport headers for reaching
a host behind a proxy, and Authelia, oauth2-proxy or an mTLS gateway are the
same shape. The UI offers a "behind Cloudflare Access" shortcut that pre-fills
the two header names — an affordance only; storage and wire format stay generic.
Header names are validated as HTTP tokens on save and reserved names are
refused, but the merge in `postToWorpIngest` writes `Authorization` last anyway,
so no stored entry can displace worp's own auth.

`extraHeaders` on the settings PUT is a *patch* over that map, not a
replacement (#119): a name mapped to a string sets it, to `null` removes it,
and an unnamed one is left as stored — the map is cleared by naming every
header null. It has to be, because the editor is shown names and masked hints
and never the values: a replacement made removing one header mean retyping
every other header's secret, and made a save from a page loaded five minutes
ago delete whatever had been added since. `mergeExtraHeaders` in `worpConfig.ts`
is the merge (case-insensitive, since field names are), applied inside
`encryptedSecrets.ts` so the values it keeps never leave the one module that
decrypts. The editor's own rules — which rows can be saved, which names are
refused before the request — are `packages/web/src/features/settings/worpHeaderDraft.ts`.

## The Claude Code token

The fourth provider's credential is not a vendor API key, so it is not named for
a vendor. It sits in `encrypted_secrets` — the same name-keyed store
(`services/encryptedSecrets.ts`) worp's two secrets use — under the dotted name
`claude_code.oauth_token`, same AES-256-GCM, same one-decryptor rule:
`readSecretEffect` and `readClaudeCodeTokenEffect` are both absent from
`packages/core/src/index.ts`, and `claude/Claude.ts` imports
`services/claudeCodeToken.ts` directly (#109).

That row is the only source. It was briefly two — `CLAUDE_CODE_OAUTH_TOKEN`
was read as a fallback so an upgrade cost no deployment its triage — and the
fallback is gone: the variable is not read, so a token nobody pasted does not
exist, and an install that had only ever set it has no AI credential until
someone enters one. With no row, callers get the unchanged
`ClaudeTokenMissingError`. The status is therefore the same
`{ configured, hint }` every other secret's is, with no `source` field to say
which of two homes is live, and `GET /auth/claude/status` answers from the same
service as `GET|PUT|DELETE /settings/claude-code-token`.

Nothing degrades on a store failure either. The read path used to fall back to
the environment when `encrypted_secrets` was unreachable; with nothing to fall
back to, answering "no token" on a database blip would report a missing
credential to an operator who has one, so both the read and the status fail
loudly instead.

## The store seam

Services do not build their own queries. The stores
(`packages/core/src/stores/contracts.ts`) are narrow `Effect.Tag` services, one
per aggregate, each with a Postgres adapter (`stores/postgres.ts`) and an
in-memory one (`testkit/stores.ts`, `testkit/mailbox.ts`). Two implementations
are what make the seam real (#132).

There are five. `SettingsStore` and `SecretStore` were the first — five
operations over `app_settings` and `encrypted_secrets`. `MessageStore`,
`TriageStore` and `LabelStore` (#136) are the mailbox: the rows a page of the
list is made of, what Claude said about them, and the label catalogue both
`services/messages.ts` and `services/apply.ts` attach from. A store spans more
than one table where the read model does — a listed message carries its
account's email and its newest triage's priority — because the row shape is what
the seam promises, not the join that produces it.

The requirement rides in the `R` channel, so it is the *boundary* that answers
it: the Promise facades call `runWithStores(effect)` (`stores/postgres.ts`),
and `AppLive` and the sync entry points provide `StoresLive` for the effects
that run under them. Nothing in between names a database, and an effect with no
store provided does not compile — which is the point: a test that forgets to
inject gets a type error rather than a connection attempt.

`makeTestStores({ settings, secrets, mailbox })` is what a suite uses instead:
`stores.run(effect)` at the Promise boundary, `stores.provide(effect)` when the
Exit is what is being asserted, seeded rows for "already stored", recorded
`writes`/`removals` (and, for the mailbox, the row arrays themselves) for the
assertions that are genuinely about storage, and `offline = true` for "the
database is unreachable". Mailbox rows are seeded with the columns a test cares
about and default the rest, so a suite about pagination writes `internalDate`
and nothing else; `testkit/gmail.ts` is the other half of a message-action
suite, a recording `GmailDataAdapter` that can be told to refuse.

That replaced a `mock.module("../db/client")` fake per suite, each hand-rolling
the drizzle builder chain its service happened to call — including one that
sniffed the bound value out of `eq()`'s `queryChunks` to decide which row to
serve. Those fakes asserted query shapes rather than behaviour and, being
process-global, decided what `db/client` meant for every file loaded after them.

What stays in the services is the part worth testing: the cursor's encoding,
which suggestions still count as pending, that a label id from another account
names nothing, and that Gmail is told before anything is written locally — so a
modification Gmail refuses leaves the mailbox and the database agreeing.

The seam is drawn at the ciphertext, not at the row: `encrypt`/`decrypt` stay in
`services/encryptedSecrets.ts`, so a store — and anything substituted for one —
sees a blob and never a secret. `stores/seam.test.ts` guards both halves of
that: the seamed services import nothing that talks to Postgres, and no adapter
imports `util/crypto`.

It guards the other direction too, which is the quieter mistake: exactly one of
the two adapters may ship. A module that runs in production importing
`testkit/stores` would write settings to a Map and lose them on restart, and no
test would say so — every suite injects its own stores, so all of them go on
passing, and the other guards look for a database being reached rather than for
one not being. So nothing outside a test may import the testkit, and neither the
barrel nor core's subpath `exports` may name `stores/` or `testkit/`: a store is
a seam within core, and every caller outside it goes through a Promise facade
that provides Postgres itself.

Two adapters only make the seam real while they answer the same way, so the
contract is written once — `testkit/storeContract.ts` — and run against both:
`testkit/stores.test.ts` applies it to the Map, `stores/postgres.dbtest.ts` to
the real tables (missing row → null, upsert rather than a second row, values
byte for byte, the removal count). Each file then asserts only what is its own,
the fake's recording and outage switch on one side, nothing on the other.

That Postgres file is named `.dbtest.ts` on purpose and
`scripts/test-with-db.sh` runs it by path, in a process of its own, after the
`bun test ./src` sweep. It is the one suite that has to reach the real
`db/client`, and the fakes that are left — filters, logs, GoogleAuth — are
`mock.module`, which is process-global and owns `getDb` for every file loaded
after it. Inside the sweep these tests are served by whichever fake loaded
first, so "no row yet" would pass with no database behind it; `mock.restore()`
does not undo a module mock. It rejoins the sweep when those aggregates have
stores too.

## The compose window

Replying is a floating window, not a block at the bottom of the page (#96):
docked bottom-right at `z-[80]`, collapsible to its own title bar, over the page
rather than in its flow. The split is the thing to keep. `features/compose/*` is
the window — the shell (`ComposeWindow`), its title bar, the To/Cc/Subject
header, the body field, the footer, plus the two pure modules `recipients.ts`
(one text field per address list, parsed but never rewritten under the caret)
and `composeWindowState.ts` — and none of it knows a message is being answered.
`features/reply/*` is the reply: the prefilled recipients and subject
(`replyDefaults.ts`), the AI instruction section carried over from #91, and the
two mutations. A future blank Compose mounts the same shell with an empty form;
that is why the seam exists, and it is deliberately not wired to a button here.

Which of the three states the window is in is derived, not stored:
`composeWindowMode(intent, draft)` folds the user's intent together with "is
there anything unsent", so a window holding a draft or typed text cannot fall
shut — #91's non-negotiable, now with a third state. Minimize is exempt from
that override on purpose: it is an explicit request to keep the draft and get it
out of the way, and a window that re-expanded itself would read as broken. The
body is unmounted while minimized rather than hidden, which is safe because
every field is controlled by `ReplyComposer`'s state.

To and Cc being editable is end to end, not decoration: `SendReplyRequest`
takes optional `to`/`cc`, `services/replyRecipients.ts` decides between what was
typed and the old default (the sender of the message being answered), and
`rfc822.ts` writes a `Cc` header when there is one. Optional throughout, because
the CLI names neither and must keep addressing replies the way it always did.

## Conventions

- All public exports live in `packages/core/src/index.ts`. Add new service/schema/adapter exports there.
- API routes do shape-validation with Zod and delegate to core services — keep business logic out of routes.
- The Gmail Effect services (`google/*`) and the Claude service (`claude/Claude.ts`) are the only places we reach external systems (Google REST / the `claude` subprocess). They return typed results and fail with distinct `Data.TaggedError`s (`errors.ts`); never trust raw stdout/responses elsewhere.
- React: one component per file, prefer small composable subcomponents over big `return`s (this is a global preference).
- TS is `strict`. No implicit `any`, no skipping null checks.

## Linting

**oxlint** is the linter, wired like the formatter: one `lint` script per package (`oxlint -c ../../.oxlintrc.json .`), fanned out by turbo as `bun run lint`, with the single config `.oxlintrc.json` at the repo root. It is a root devDependency, so no package pins its own version. `.oxlintrc.json` is JSONC — every rule turned off carries a comment on the line above saying why, which is the only form of exemption allowed here.

Two categories are errors: **correctness** (code that is outright wrong) and **suspicious** (code that is most likely wrong). No category is ever disabled — that would be getting to zero by not looking. The TypeScript, unicorn and oxc plugins are on repo-wide, and so are **react**, **react-hooks** and **jsx-a11y**, which exist for `@miel/web` and `@miel/landing-page`. Those three are listed globally rather than under an `overrides` entry scoped to the two UI packages because oxlint resolves `categories` against the base plugin set only: a plugin added inside an override contributes nothing unless each of its rules is also named there by hand. The packages with no JSX have nothing for those rules to match.

Three rules are narrowed in config, each with its reason inline: `react/react-in-jsx-scope` is off (React 19's automatic runtime), `eslint/no-underscore-dangle` allows Effect's `_tag` plus the two `_reset*ForTests` hooks, and `jsx-a11y/label-has-associated-control` is told which gousse-ui components render a native control. Everything else was fixed rather than silenced. A handful of call sites carry `// oxlint-disable-next-line <rule> -- <reason>`; the `--` reason is mandatory and a test enforces it.

The vendored gousse-ui source (`packages/web/src/components/ui/**`, `packages/web/src/lib/gousse/**`) is exempt from linting for the reason it is exempt from formatting: `bunx shadcn@latest add @gousse/<item>` overwrites those files from upstream, so a fix applied there is undone by the next re-add. The generated `packages/landing-page/src/routeTree.gen.ts` is exempt too. `packages/web/src/linting.test.ts` guards all of this, including that the ignore patterns match real files rather than silently matching nothing.

`unicorn/no-array-sort` steers in-place `.sort()` onto `Array#toSorted`, which is why `tsconfig.base.json` sets `"lib": ["ES2023"]` — types only; `target` stays ES2022 and ES2023 adds no syntax to emit.

## Continuous integration

`.github/workflows/ci.yml` is the repo's only workflow. It runs on every **pull request** on Bun 1.3, in two jobs. `checks` is the static gate — `bun run lint`, `bun run format:check`, `bun run typecheck`, each its own step, so any one of them failing fails the PR. `tests` runs `bun run test` against a `postgres:16` service container, the same major `docker-compose.dev.yml` runs locally, with `DATABASE_URL` set for the whole job and migrations applied in a step of their own before the suite. Install is `bun install --frozen-lockfile` against public registries — no auth step.

The two jobs are separate because they wait on different things; the static checks shouldn't queue behind a database. The handoff is `DATABASE_URL`: `packages/core/scripts/test-with-db.sh` and its `@miel/api` twin start an ephemeral container only when that variable is unset, and otherwise run against whatever it names. `packages/web/src/ci.test.ts` guards the workflow, including that the Postgres major matches the compose file's and that the connection string matches the service's own credentials.

## Formatting

**oxfmt** is the only formatter, wired like `lint`: a `format` / `format:check` pair in every package, run across the workspace by turbo. `bun run format` rewrites, `bun run format:check` verifies and is what CI should call. It is a root devDependency, so no package pins its own version, and the one config is `.oxfmtrc.json` at the repo root — options left at their defaults (100-column, semicolons, double quotes), nothing but the ignore list.

The scripts pass `"**/*.{ts,tsx}"` rather than `.` deliberately. oxfmt also formats JSON, Markdown and CSS, and those files here have other owners: `bun add` rewrites a `package.json` (and oxfmt would re-sort its keys), `drizzle-kit generate` rewrites `packages/core/drizzle/meta/*.json`. Widening the glob means fighting those tools on every run.

`.oxfmtrc.json` exempts the vendored gousse-ui source — `packages/web/src/components/ui/**` and `packages/web/src/lib/gousse/**`. Those files are copied in from the registry and `bunx shadcn@latest add @gousse/<item>` overwrites them in place, so formatting them would make every upstream re-add arrive as whitespace noise with the real change buried in it. Leave them in whatever shape upstream ships. The generated `packages/landing-page/src/routeTree.gen.ts` is exempt for the same reason: the TanStack Router plugin rewrites it on every dev run and build. `packages/web/src/formatting.test.ts` guards all of this.

## The web DOM harness

`@miel/web` renders in its tests. `packages/web/bunfig.toml` preloads
`src/testing/domHarness.ts`, which registers **happy-dom** and React Testing
Library's `cleanup` before any test file is loaded (#129) — so DOM globals
arrive the same way for every suite, and no test file builds one on its way
past. That last part is the rule, not a style: bun shares globals across test
files, so a suite that assigned `globalThis.window` decided what `window` meant
for every file after it, which is what one suite's hand-rolled cleanup existed
to undo. `src/testing/domHarness.test.ts` guards the wiring and scans the other
suites for a hand-built global.

Two things the registration settles for everyone: the window sits on the app's
own origin and `/app` prefix, so `apiFetch` resolving a path-only base builds
the URL a browser would; and main-frame navigation is off with the URL fallback
left on, so `location.assign` records where a click sent the browser instead of
fetching it.

The wiring suites are rendered, not read (#129, #134, #135, #137): the onboarding
gate (`gateSteps`), the connect failure (`connectFailureWiring` — which mounts the
whole of `App` at the URL the OAuth callback lands on), the two filters suites
(`filterSelectionWiring`, `filterMergeWiring`), the section headers'
enter/exit (`components/sectionHeaderPresence.test.tsx`, which switches account
and reads the counts both headers are showing mid-exit — and sets happy-dom's
`prefersReducedMotion` for the path that has no exit window), the zero-account
empty states and the two credential suites
(`features/settings/CredentialsCard.test.tsx` and `credentialErrors.test.tsx`,
where a save, a refusal and a clear are exercised as clicks) each mount the
components and assert what a user sees, clicks and reads.
That is the standard for anything a render can reach: a regex over a component's
source asserts a spelling — it breaks on a rename with no behaviour changed, and
passes on a component wired to the wrong thing. What is still read as source is
what no render answers: the repo's own shape (linting, formatting, ci, docs) and
the copy-wide word sweeps (`uiCopy` — no vendor name, no stale `miel accounts`
advice, and the credential copy table naming no env var). A sweep stays a sweep
on purpose: what it guards against is a *new* surface written later, and no
render reaches a component that does not exist yet.

Two seams a render stubs. `fetch` is the usual one — going through the real
`apiFetch` also proves the URL and body the endpoint receives — and every
request a suite has not seeded for should be refused, so a query reaching the
network fails loudly instead of returning a silent `{}`. `api/client.ts` itself
is mocked in `gateSteps` only, in the test file's own body: a bun module mock is
process-global, so a suite that does not register its own gets whichever one ran
last.

## Useful scripts

- `bun run typecheck` (root) — turbo runs `tsc --noEmit` across packages.
- `bun run build` — turbo build.
- `bun run format` / `bun run format:check` — turbo runs oxfmt across packages (write / verify).
- `bun run lint` — turbo runs oxlint across packages. This plus `format:check`, `typecheck` and `test` is exactly what CI gates a PR on.
- `packages/api/scripts/smoke-api.ts`, `packages/cli/scripts/smoke-cli.ts` — quick end-to-end smoke tests.
- `packages/cli/scripts/seed-apply.ts` — seed helper for apply flows.

All three seed against a Gmail account you name in `MIEL_TEST_ACCOUNT` (they exit
with that instruction when it is unset) rather than one baked into the file:
`MIEL_TEST_ACCOUNT=you@example.com bun scripts/smoke-cli.ts`. Note that they are
stale as of #99 — they still import `syncAccountsFromGog` and `GogAdapter`, which
the backend rewrite removed from core, so they fail to load until someone ports
them onto the Effect Gmail services.

## Things to know

- The API is **not** public-facing; it auths every non-`/health` route with a single bearer token (`API_SECRET`). CORS is locked to `http://localhost:3000` by default.
- `bun dev` tees each dev server's stdout/stderr to `logs/api.log` and `logs/web.log` at repo root. Read these directly to see current server/browser-console-adjacent output — no need to attach to the running process. Logs are gitignored and truncate on each `bun dev` restart (`tee`, not `tee -a`).
- `PRD.md` at the repo root is the product spec — useful when planning new features, but it isn't code.
- `CONTRIBUTING.md` is this file's human-facing subset (setup, the four gated checks, the conventions, the vendored-component caveat) and `SECURITY.md` is the disclosure policy; `.github/ISSUE_TEMPLATE/` and `.github/pull_request_template.md` hold the templates. Changing a check, a convention or a setup step means changing `CONTRIBUTING.md` too — `packages/web/src/contributorDocs.test.ts` derives what it asserts from the CI workflow and the landing page's contact constant, so drift fails there.
- What goes to Claude is stated in `packages/core/src/claudeUsage.ts` — batch size (default 15, configurable per install, capped at 50) and the 8000-char body truncation applied when drafting a reply. Triage itself sends only sender/subject/snippet/labels; Claude fetches a body through the local API when it needs one. The public landing page derives its disclosure from those constants, so change them there, not in a copy.
