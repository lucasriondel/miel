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

# 3. Dev — runs api + web only, behind portless; see root package.json
bun dev
```

The API applies pending drizzle migrations on boot (`runMigrations()` in `packages/api/src/index.ts`) and exits non-zero if they fail, so there is no manual migrate step in dev or in Docker. To run them standalone anyway: `bun run --env-file=.env packages/core/src/db/migrate.ts`.

`bun dev` runs each package behind **portless**, which fronts the dev servers at stable `.localhost` hostnames over HTTPS — `miel.localhost`, `api.miel.localhost`, `landing.miel.localhost` — and hands each child an ephemeral port in `PORT`. That is why every package's real dev command is `dev:app` and its `dev` is just `portless`: the proxy runs the `dev:app` script named in the config. Each name is written **twice**, and both spellings are load-bearing. `portless.json` at the root holds the `apps` map, which is what a bare `portless` run *from the repo root* reads. But `bun dev` is `turbo run dev`, and turbo runs `portless` with the cwd set to each package — where portless resolves config locally and does not walk up to the root file, so every app came up as its bare package name (`api.localhost`, `web.localhost`). The fix is the per-package `"portless"` key in each `package.json`, which portless documents as taking precedence over a `portless.json` app entry; it is what actually names the hosts under turbo. Renaming an app or pinning its port means editing both. To bypass the proxy and bind the registry's rows instead (~/dev/PORTS.md — web 5230, api 5531, landing page 5200), run a package's `PORTLESS=0 bun dev:app`. Configs that need an *address* carry both spellings and pick between them on `PORTLESS_URL`, which portless sets in every child it spawns. A *port* is the other half of that rule and is easier to get wrong: portless registers the ephemeral port it handed out, so a server that binds its own registry row instead is routed to a port nothing listens on and every request through the hostname answers 502 — while both sides still print a healthy startup. So each dev server takes `PORT` first and falls back to its row: `Number(process.env.PORT ?? API_PORT)` in `packages/api/src/index.ts`, `Number(process.env.PORT ?? webPort)` in web's vite config. `packages/web/src/devHostnames.test.ts` guards the names and this rule.

The root `bun dev` is scoped to `@miel/api` + `@miel/web` deliberately; core/cli don't have long-running dev tasks. The landing page is independent of both — run it on its own with `cd packages/landing-page && bun run dev` (https://landing.miel.localhost; direct, `PORTLESS=0 bun run dev:app` on :5200, which fails loudly if the port is taken). `bun run build` at the root does build it, since the container needs its prerendered output.

The web app is served under the `/app` path prefix (`APP_BASE_PATH` in `packages/core/src/appBasePath.ts` — Vite's `base`, the router's `basename`, and nginx's SPA fallback all derive from it), so in dev it's at https://miel.localhost/app. The `/api` proxy sits outside the prefix: the app must reach its API same-origin.

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
- `promo_codes` — one discount code extracted from a marketing mail, keyed back to it. Two states on one row: suggested (the extraction wrote it) and saved (`saved_at`, the user acted) — the save also writes the six denormalised copies of the mail (subject, sender name/address, `internal_date`, HTML and stripped text), which is what makes a saved promo outlive the Gmail original it trashes. `expires_at` is stored at end-of-day UTC and treated as a date (`promoExpiry.ts`), never an instant.
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

Each AI task — triage, reply, filter-suggest, and since #156 `promo-extract` —
runs through a provider of its own: `claude-code` (the local `claude` subprocess) or
one of the hosted vendors — `anthropic`, `google`, `openai` — over HTTP through
the Vercel ai-sdk (#105). The catalogue is `packages/core/src/providerModels.ts`,
a leaf module: which providers exist, each one's curated model list, its
default, and `MODEL_TASKS`. The API validates a save against it and the web
pickers are built from it, so there is one list rather than three — and since
#154 that is true of all four tasks rather than a claim the card and the wire
schema each undercut by naming three by hand. Both doors now derive the list:
`UpdateSettingsRequest`'s shape and `ModelsCard`'s `MODEL_ROWS` table each carry
a `satisfies` over a record keyed by `ModelTask` — zod needs the field pairs
spelled out to infer them, so the guard is a type rather than a loop. A fifth
task stops both files compiling until it is named. Note the spelling the hyphen forces:
`promo-extract.provider` as a settings key, `"promo-extractProvider"` on
`ModelSettings` and on the patch, quoted wherever it appears.

Why that mattered rather than being tidy: `promo-extract` had no picker and no
schema field while running on every sync (#159), so a patch naming it was
stripped by the parse and answered 200 with the settings unchanged — an edit its
sender is told landed — and an install running its other tasks on a vendor
extracted promos through a local CLI it had no token for, which stops the whole
sync.

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

`promo-extract` (#156) is what that table was built for: the fourth task cost a
row and no second copy of the transport branch. It reads one marketing mail and
answers with zero or more promos (code, discount, terms, expiry, merchant — no
confidence score, and an empty array is the negative answer). Two things it is
easy to undo by accident. Both its prompt columns hold one builder, because it
inlines the mail's text and has no tool: triage's body-fetch paragraph would be
dead text carrying `API_SECRET` to a vendor, and `allowedTools` is empty for the
same reason. And what it inlines is the mail's *stripped visible text*
(`util/htmlText.ts` — markup gone, style/script contents dropped, entities
decoded, whitespace collapsed), truncated at `REPLY_BODY_TRUNCATION`, imported
from `claudeUsage.ts` rather than restated. The truncation sits in the prompt
builder rather than in the service the way reply's does, and it stays there: the
builder is the only thing both transports go through.

Its caller landed in #159 — see *Extracting promo codes* below — and the
disclosure had caught up one issue earlier (#158), before any caller did: the
task sends a body whether or not a service calls it, so `claudeUsage.ts`'s
`BODY_BEARING_TASKS` names it and the published documents say two requests
carry a body, not one. The landing page and the privacy policy build their
sentence out of that list rather than restating it, so a third body-bearing
task fails their suites until the copy names it.

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

## Extracting promo codes

`services/promoCodes.ts` owns the prefilter call and the extraction, and
`sync/fetchPhase.ts` calls it — one line after `stepUpsertAndLink`, because a
promo row is keyed to its message and has nothing to hang off until the messages
exist (#159). Neither half is written inline in `sync/steps.ts`, which has
enough concerns.

The rules the shape is load-bearing for:

- **New messages only, once.** The phase hands over what the fetch just
  upserted. There is no backfill and deliberately **no extraction-attempted
  marker** — nothing ever asks twice, so "found nothing" and "never asked" are
  indistinguishable and neither needs recording. The accepted consequence is
  that the feature is blind to the existing mailbox and fills forward. Adding
  backfill later means re-extracting a range wholesale.
- **One mail per model call.** A batch of stripped marketing mails invites the
  model to attribute one shop's code to another — a wrong answer landing in a
  row the user trusts at a checkout. Cost is the prefilter's job, not batching's;
  `EXTRACT_CONCURRENCY` bounds how many run at once and is deliberately not a
  setting.
- **One text, two readers.** The prefilter judges and the model reads the same
  string — the HTML part stripped by `util/htmlText.ts` when there is one, the
  plain part otherwise — so the decision and the evidence cannot come apart. The
  HTML is preferred because a marketing mail's text/plain part is routinely a
  "view this in your browser" stub.
- **Two classes of failure, and only one is ours.** A malformed answer on one
  mail is logged and skipped, so a sync that triaged fine is not lost to it; a
  provider that cannot run propagates through the same
  `sync/providerFailure.ts` combinator triage and filter-suggest use, and
  `syncAll` stops the run and emits `sync.provider_unavailable` as it already
  does. A third AI call site with its own catch is the drift #126 fixed. Note
  what that costs: an extraction whose provider cannot run loses the sync even
  when triage's own provider is fine. Which provider that is has been the
  install's own answer since #154 — the task has a picker like the other three —
  rather than `SETTING_DEFAULTS` with no way to say otherwise.
- **No new sync socket event.** It is a step inside fetch, and a wire event
  would mean the `SyncServerEvent` / `ReceivedSyncServerEvent` compatibility
  dance the repo already carries once. Its failures ride in the sync window's
  error list; surface it later if it is missed.

What is stored is a *suggestion* — `savedAt` stays null until the user acts —
with the expiry the model answered (`YYYY-MM-DD`) written at end-of-day UTC
through `promoExpiry.ts`, and `merchant` falling back to the sender's display
name. The extraction half stays in-core, absent from `index.ts` for the reason
`promoPrefilter.ts` is; the read half below is the one door.

## Asking one message for its promo codes

The sync's extraction fills forward and never looks back, so the mail that was
already in the mailbox when the feature shipped — and the one the prefilter
passed over — had no way to be asked. The message page's Promo Codes panel is
that way (#165): `POST /messages/:accountId/:gmailMessageId/extract-promos`,
`extractPromosForMessageEffect` behind it, and
`features/message-detail/PromoCodePanel.tsx` on screen.

It is the same task and the same prompt as the sync's, and it differs in exactly
three ways, each of which is the point rather than an inconsistency:

- **No prefilter.** `shouldExtractPromos` bounds what a *sync* spends by
  guessing from content which mails are worth a call. A user pressing the button
  is the decision to spend one, and the mail the prefilter skipped is precisely
  when they would press it — so consulting it here would make the button
  silently do nothing in the one case it exists for.
- **Asking again replaces.** Nothing in the sync path asks twice, which is what
  lets it write without looking; a button can be pressed twice, so this clears
  the message's rows before it writes. `PromoStore.removeUnsavedForMessage` is
  the operation and `isNull(savedAt)` is the whole of its rule: a fresh model
  answer is a guess, a save is a decision, and a guess never overwrites a
  decision — the saved row carries the only surviving copy of a mail the save
  trashed. A run that finds nothing clears too, because "the model now says
  there is nothing here" is an answer and leaving the old guess up would
  contradict what the button just reported.
- **Both classes of failure reach the caller.** A sync swallows one bad answer
  so the rest of the run survives; here the run *is* the one message, so there
  is nothing to protect and the presser is owed the refusal. A provider that
  cannot run surfaces as the same `ProviderUnavailableError` every other call
  site raises and the middleware maps it to the usual 503.

The route is a sibling of `filter-suggest` rather than a `/promo-codes` route,
and the path states why: it acts on a *message*, which is what it is given and
what it reads, while `/promo-codes/:id` names a promo — and before this runs
there may be no promo to name. It takes no body; the task has no steer.

On screen the trigger and the result share one card, the way the verification
panel beside it keeps its codes with the act they belong to: this is not an
action on the message but a reading of it, so it sits under `TriagePanel` with
the other things read out of the mail rather than in the top bar. Unlike that
neighbour the panel is always drawn — one that hid itself until it had news
could never be *asked*, and being askable is the feature. The mutation is not
optimistic, because its whole content is an answer nobody can predict; it
invalidates `["promo-suggestions"]`, since the run rewrote what the inbox strip
holds for that mail, and reads its own result rather than that cache, which is
scoped to an account and a period this page has no reason to satisfy.

## Promo suggestions above the inbox

The codes the sync found become visible (#160): a horizontally scrolling row of
cards above the message list, first thing under the filter suggestions and the
verification-code strip, and gone entirely when there is nothing to suggest.

`listPromoSuggestionsEffect` in `services/promoCodes.ts` is where every rule
lives, and the split between it and `PromoStore` is the part to keep. Three of
them are storage's, because they *are* the read model: unsaved only, one
account, and the mailbox rule — an unsaved detection whose mail was archived,
trashed or removed follows it out, which is why `unsaved` joins `messages`.
Three are the section's: an expired promo is not a suggestion (an unstated
expiry is not an expired one, and the stored instant is the end of the day, so a
promo lapsing today is shown for the whole of it), a repeated code is one card
(deduped *before* the cap, so a shop's third reminder cannot spend a slot;
code-less offers are never folded, since only a code identifies an offer), and
`MAX_PROMO_SUGGESTIONS` caps it. `now` is a parameter rather than a call to the
clock, so "expired" is assertable. The Promise facade put the service in
`stores/seam.test.ts`'s `SEAMED_SERVICES`.

`GET /promo-codes` is its own endpoint and `["promo-suggestions", params]` its
own query key, deliberately not an array widened onto the listed-message
payload: the two have different lifetimes and invalidation, and that payload is
sent for every row, so a variable-length array on it would cost every message to
serve a feature that hits few. Scoping is done by passing the period to the
server, not by filtering loaded items — the list payload has no bodies and
therefore no promos.

The consequence of a separate key is that the lists' invalidation does not reach
it, and after a removal the lists are authoritative and not re-read at all. So
archive, trash and the bulk action name it in `alsoInvalidate`
(`api/mutations.ts`), which is what makes the mailbox rule true on screen rather
than only on the next read. The save (#161) is where the two keys move together;
see below.

Nothing is reused from the verification-code strip. That strip is browser-side
regex over subject and snippet with no persistence, which works because an OTP
is in the subject; a promo code is three screens down inside the HTML, so this
is a server-side extraction the section merely reads. The two share a position
and nothing else — a pill cannot hold four fields, so these are cards, and the
strip's 24h age rule does not transfer (a promo's own expiry is the age rule).
The strip stays above the cards: a verification code is worth minutes and one
row of height, so it must not be scrolled past to reach codes that keep for
weeks. Both are hidden in select mode.

`features/promos/promoExpiryLabel.ts` is pinned to UTC on purpose — read in a
local zone, the stored `…T23:59:59.999Z` would show as the next day east of
Greenwich — and answers "No end date" rather than inventing one, because the
extraction is told never to guess a date.

One thing that suite had to solve and the next fetch-seam suite will too: a bun
module mock is process-global, so a suite whose seam is `fetch` inherits
whichever `api/client` stub ran last. `promoSuggestionsWiring.test.tsx` puts the
real client back by importing it as `"../../api/client.ts?real"` — the same
source under a specifier no mock is registered against, declared in
`vite-env.d.ts` — and re-registering it *spread*, since a module namespace
object registers as no replacement at all.

## Saving a promo, and trashing its mail

One button on the card does both (#161), and the **order between the two writes
is the feature**: `savePromoEffect` in `services/promoCodes.ts` writes the saved
state with its denormalised copy of the mail *first*, then calls the same
`trashMessageEffect` every other caller uses. A trash Gmail refuses leaves the
promo saved — recoverable, mildly confusing, a mail deleted by hand — while the
reverse order allows trash-succeeds-then-save-fails, which deletes the mail and
loses the code with no way back. That is a deliberate departure from the apply
service's guarantee that Gmail is told before anything is written locally, and
it is the reason this is a core service (`POST /promo-codes/:id/save` is a route
that validates an id and delegates) rather than a click handler. Trash, not
permanent delete: deleting for good needs the full-mailbox scope re-consented by
every account, to make one button thirty days more final, and the local copy is
permanent anyway. The copy is taken from the `messages` row, because that mail
is on its way out and this is the only version anyone sees again.

`trashedThreadId: null` is how the result says the second half did not happen.
An already-saved row keeps the record it was saved with and only retries the
trash — the record is a record.

On screen the card and the row leave on the click and come back together if the
save is refused, and *neither* is a second copy of the optimistic machinery:
`api/messageMutation.ts` gained `optimisticSide`, one more list-shaped cache
that is cancelled, snapshotted, written and rolled back in the same step as the
message lists. The plan drops every suggestion of that mail, not only the one
saved — the mail is going, and a suggestion follows its mail. The one branch the
mutation adds for itself is the partial success: a save whose trash was refused
re-reads the lists (the mail is still in the inbox, so the row must come back)
and says so, which is the only way the user learns there is something left to do
by hand. `mutations.savePromo.test.ts` covers that branch, because no render can
reach it; the click, the removal and the refusal are rendered in
`promoSuggestionsWiring.test.tsx`.

## The Promo Codes page

Saved promos get a home (#162): `pages/PromoCodesPage.tsx` at **`/promo-codes`**,
a top-level route beside logs and settings with one entry in the sidebar's
footer nav. Global, not account-scoped, and that is the feature rather than a
shortcut — a promo code is a thing used at a checkout, so which mailbox it
arrived in is a **column** on the row and never a filter the user must satisfy
before seeing anything. Being outside `/account` is also what keeps it: `App`'s
`isAccountScope` only redirects `/` and `/account…` into the default account, so
a top-level route is excluded by construction.

`listSavedPromosEffect` owns the rules, `now` a parameter so which section a
promo is in is assertable. Active is soonest-expiring first with the
no-expiry promos last among them (dated urgency outranks an open-ended offer,
and an unstated expiry is still not an expired one); expired sits below,
greyed, most recently lapsed first, and is **never** deleted — deletion is
always the user's own act. Both sorts are stable over what the store answered,
so promos sharing a deadline stay newest-saved first. Nothing is deduped: the
suggestions section folds a shop's repeated code into one card because three
reminder mails are one offer, but two saves are two decisions and the page does
not overrule either.

`PromoStore.saved()` answers `SavedPromoCode` — the row plus its
`accountEmail`, joined to `accounts` in both adapters. The email is the store's
to answer for the reason a listed message carries its account's: the row shape
is what the seam promises, not the join that produces it, and a caller
resolving ids against a separate accounts read would be doing this join itself.
The contract's `PromoWorld.account()` hands back `{ id, email }` for the same
reason — an adapter that joined *any* account would otherwise pass.

What the payload deliberately omits is the copy of the mail. The save
denormalised subject, sender, date and both bodies onto the row so a saved
promo outlives the Gmail original it trashed; a *list* carrying them would send
every saved mail's HTML to draw a table of five short fields. Reading the
original is one promo at a time and gets its own read when it lands.

`GET /promo-codes/saved` takes no parameters at all, and `["saved-promos"]` is
its own query key — the page lists exactly what the suggestions no longer do,
so the two are read at different moments and invalidated by different acts.
`promoCodesPageWiring.test.tsx` renders the page with `fetch` stubbed and
unseeded requests refused, asserting the order the rows are read in, and mounts
`App` at the route to show the default-account redirect leaves it alone.

## Taking the code, and reading the mail it came from

The two things anyone does with a saved promo while standing at a checkout
(#163), and neither of them changes the promo.

**Copy** is `features/promos/CopyPromoCodeButton.tsx`: the code chip *is* the
button, because a user reaching for a code aims at the code. No request leaves,
no flag is set and no timestamp is written — there is no signal anywhere that a
code was ever redeemed, so a "used" mark would have to be un-marked by hand and
would lie in the meantime, and checking whether a code still works must not cost
an edit. The confirmation is local and transient (the label flips to "Copied"),
which says the one thing that happened. A code-less offer offers nothing to
copy. A browser that refuses the clipboard raises a toast, so the one click that
did nothing does not read as one that worked.

**View the original** reads the *copy the save took*, never the `messages` row:
`readSavedPromoMailEffect` answers subject, sender, date and both bodies off the
promo row, behind `GET /promo-codes/:id/original`. That is the point of the
denormalisation — the save trashed the Gmail original in the same gesture and
Gmail purges its own trash a month later, so a read that resolved the message
would answer nothing at exactly the moment this is the only version left. A
promo nobody saved has no copy (the columns are written at save time and at no
other moment) and answers the same 404 an unknown id does, because a viewer must
never draw an empty mail as though that were what the shop sent.

The read is the dialog's, not the page's: `usePromoOriginalMail(id)` is disabled
until `ViewOriginalMailButton` opens one, so a table of twenty rows fetches no
mail until someone asks for one — which is why the list payload carries no
bodies in the first place. `["promo-original", id]` is its own key with
`staleTime: Infinity` and nothing invalidates it: a record does not change.
`SavedPromoMailBody` renders the stored HTML and falls back to the stored text,
with **no HTML/Text toggle** unlike a live message — the question a record
answers is "what did the small print say", not "which rendering do you prefer".
The browser's remote-images preference still applies: the mail is gone from
Gmail, but its images are still hosted by the sender and loading one is still
the read receipt it always was.

Everything in that dialog is read-only, and that is the rule rather than an
omission: the five extracted fields are the model's guesses and are the
corrigible part (#164, below), while the copy of the mail is a record. The
dialog's only control closes it, and the endpoint has no writer.

## Correcting a promo, and removing one

The other half of that rule (#164): the guesses are editable, the record is not,
and the page is the user's to curate.

`PATCH /promo-codes/:id` edits **all five** extracted fields, and all five is the
point rather than a convenience — they are the model's answers on deliberately
slippery marketing prose, so locking any subset guarantees the locked one is the
field it got wrong. `UpdatePromoRequest` is where two rules are stated rather
than left to a service: `discount` is the one field that cannot be cleared (it is
the headline that makes a row a promo at all), and the schema is `.strict()`, so
a patch naming `subject` or `bodyHtml` is **refused** with a 400 rather than
accepted with the field quietly dropped. That refusal is what makes "the saved
copy of the mail is not editable" true for a caller instead of only on screen — a
patch silently stripped reads to its sender as an edit that landed.

`updateSavedPromoEffect` is a patch, not a replacement: a field the request does
not name is the field nobody touched, and `null` clears a nullable one. It reads
the row back rather than assembling an answer from the patch, so a caller is told
what storage holds. The expiry crosses as a calendar day (`YYYY-MM-DD`) and is
written through `promoExpiryInstant` in `promoExpiry.ts` — the same function the
extraction writes through, extracted there in this issue so a date someone typed
and a date the model read cannot become different kinds of value.

`DELETE /promo-codes/:id` is the only thing anywhere that removes a promo row.
Nothing expires itself off the page; an expired promo is greyed and kept, because
the record of what a shop offered is worth having. Both endpoints act on **saved**
rows only and answer the same 404 for an unknown id and for a detection nobody
saved — removing a suggestion would be a *dismissal*, a different act with a
different meaning that this feature does not have.

On screen, `SavedPromoRow` is now a two-state row: `SavedPromoReadRow` or
`SavedPromoEditRow`, with the flag the row's own rather than the section's, since
correcting two rows is two independent corrections and closing one would discard
typing nobody asked to discard. The editor replaces the row in place so each box
sits under the heading that names it; the account cell stays plain text, because
where a mail arrived is not a guess. `savedPromoDraft.ts` is the pure module
between the boxes and the request — the draft a row starts from (the stored
instant read as the UTC day it is the end of, for the reason `promoExpiryLabel`
is UTC-pinned), the patch naming only what changed, `null` for an emptied box,
and the one rule that refuses a save before a request leaves.

Neither mutation is optimistic, unlike every message action beside them, and the
reason is worth keeping: which of the page's two sections a promo is in is
`listSavedPromos`' rule, computed from the edited expiry against the server's
clock, so writing the answer into the cache would mean re-deriving active-vs-
expired in the browser. Both re-read `["saved-promos"]` instead. A refusal
therefore needs no rollback — nothing was written, the row still says what it
said — and a toast is what explains it. The delete asks first, in place, the way
a filter row does, and here the reason is sharper than "destructive": the save
trashed the Gmail original and Gmail purges its own trash a month later, so the
row's copy is very often the only one left anywhere.

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

There are six. `SettingsStore` and `SecretStore` were the first — five
operations over `app_settings` and `encrypted_secrets`. `MessageStore`,
`TriageStore` and `LabelStore` (#136) are the mailbox: the rows a page of the
list is made of, what Claude said about them, and the label catalogue both
`services/messages.ts` and `services/apply.ts` attach from. `PromoStore` (#157)
is `promo_codes`, with the seven operations the promo services will make and no
more — insert the extractions, read one by id, read an account's unsaved rows
for a window, read every account's saved ones, mark a row saved with its copy of
the mail, patch the five extracted fields, delete a row. A store spans more
than one table where the read model does — a listed message carries its
account's email and its newest triage's priority, and a suggested promo is
scoped by its mail's date and stops being suggested when that mail leaves the
inbox — because the row shape is what the seam promises, not the join that
produces it.

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

## The app shell

The frame around every page is gousse's `app-shell` registry item, composed once
in `packages/web/src/App.tsx`: `AppShell` › `SidebarShell` + `AppMain` ›
`TopBar` + `AppContent`. The top bar is the layout's, not the page's. It sits
above the scroll region, and a page fills it through
`features/shell/PageTopBar.tsx`, which portals the page's `TopBarStart` /
`TopBarTitle` / `TopBarEnd` into the header the layout rendered — so bar
content is declared beside the body it belongs to, is laid out by the bar's own
flex row, and picks up its `data-scrolled` state. The collapsed sidebar's open
button is the one child the bar contributes itself, which is why no page draws
a `SidebarTrigger` and `LayoutContext` no longer carries the collapsed flag.

That button has to stay leftmost, and what keeps it there is that `App` gives
the bar a slot to portal into rather than the header itself. A portal appends
to its container, so page controls portalled into the `<header>` landed wherever
the DOM stood when they mounted: with the sidebar open there is no trigger yet,
and collapsing later appended it *after* them, at the far right. The slot is a
`display: contents` div, so `TopBarStart`/`TopBarEnd` are still flex items of
the bar — their `ml-auto` and the inbox's centred period nav both resolve
against the header — while DOM order is pinned. The bar also widens its gap to
`gap-4` while collapsed, since the default leaves the trigger and the account
switcher's avatar reading as one clump.

Two things the slot module settles. Its context is tri-state on purpose:
`undefined` means no layout above (a page mounted alone in a test) and the
content renders in place, so a suite still sees the controls it would in the
app; `null` means the bar has not attached yet, and nothing renders rather than
flashing the controls inside the content for a frame. And `AppContent` is the
content column's one scrolling element — `useScrollRestoration` takes that node
and the bar watches it — so a page must never introduce its own
`overflow-y-auto`, and a sticky bar inside a page sticks at `top-0`.
`App.test.tsx` renders all of that.

Nothing in the shell owns state. The collapsed flag is `App`'s, persisted in
`localStorage`, and the scroll node rides through a callback ref into state,
because the bar renders before the region and has to re-render once there is a
node to watch — so the registry's `useAppShell` goes unused here.

Below `sm` the same flag drives a drawer over the page rather than a column
beside it, so `App` starts it closed there whatever the stored preference says,
closes it again on every navigation (a tapped row has done its job), and does
not write the stored flag from that viewport — the preference is the desktop's.
The inbox's period nav and select button leave the bar for `MobileBottomBar`
below `md`, and the account switcher shows only its avatar there, because a
fixed-height bar has no second row to wrap onto.

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

## Acting on a message

What the user did is on screen before the network answers, and is undone
visibly if the server refuses (#145). `api/messageMutation.ts` owns both halves
of that: a mutation declares `optimistic` for the `["messages"]` lists and
`optimisticDetail` for the `["message", …]` query behind the open page, and the
factory cancels, snapshots, writes and rolls back each of them. The detail is a
plan of its own rather than the list's applied twice, because it spells the same
facts differently — a priority lives on the newest triage run, a suggestion is a
`status` on that run — while the field the two share, `labels`, is edited by
helpers generic over the carrier so the pair cannot drift. Nothing is invented
for a message nobody opened: `optimisticDetail` only ever rewrites a detail
already cached.

The other half is *when* leaving happens. Archive, trash and the confirmation
panel's delete return to the inbox from the click handler, beside `mutate`
rather than inside its `onSuccess` — the row is already gone from the lists, so
there is nothing left to wait for. The consequence to keep in mind: react-query
drops the callbacks passed to `mutate` once their component unmounts, and these
always unmount, so a failure notice passed there would reach nobody. Archive and
trash therefore carry theirs on the mutation itself (`announcingFailure` in
`api/mutations.ts`), which the cache calls whether or not anyone is still
listening. `features/inbox/detailExits.test.ts` still counts the set of exits;
what each one does on screen is rendered in
`features/message-detail/detailActions.test.tsx`.

One of those actions now happens without a click: opening a message marks it
read (#142). `features/message-detail/useMarkReadOnOpen.ts` fires the same
`useSetMessageRead` the toggle uses, so the row behind the page unbolds
optimistically and a refusal rolls it back — silently, because nobody asked for
it. What the ref in that hook records is the message it has *considered*, not
the one it acted on, and that is the part to keep: `UNREAD` is read off a cache
the mutation rewrites, a refetch writes again and the top bar's toggle writes
too, so a hook that re-decided on each sighting of the label would both re-fire
on a refetch and undo a "Mark as unread" the reader had just asked for. The
consequence for the toggle's own suite is that it tests the trip back —
opening an unread message leaves no "Mark as read" to click.

## Selecting messages

Multi-select is one hook — `features/select/useSelection.ts`, account-scoped by
construction: the key is `account|item`, so one account's selection can never
reach another's rows, and only the account half is ever interpreted (the filters
page uses the same hook over filter ids). Between one checkbox and the inbox's
own "Select all (n)" sits the category select (#146):
`features/select/CategorySelectButton.tsx` in each section header — the three
priorities and untriaged, which is a category in the same sense.

Two rules are the ones to keep. Which of the two things a press does is
`toggleManySelection`'s decision, taken against the state it writes rather than
the state the header last rendered — `isSelected` is read in the button only to
name it, so a stale render can mislabel the control but cannot select the wrong
messages. And the press *is* entering select mode: `InboxPage`'s
`handleToggleCategory` calls `enterSelectMode` beside `toggleMany`, because
having to go to the top bar first would make a category select two gestures.

The rest is where it already was: the button filters `messages` to the section's
own `accountId` (never `messages[0]`'s), and it hangs off the same `live &&` the
per-category flag actions do, so a header on its way out during an account
switch carries no select — its `messages` are the account being switched *to*.
The flag actions are still select mode's to hide; the select is not.

## Attachments

The files that arrived with a message sit *under* it (#143), not in its header.
`features/message-detail/MessageAttachmentsSection.tsx` is the section — a
heading and one full-width `AttachmentRow` per file on the shared detail card —
and it renders nothing at all when there are none. The header's badge row is
labels and label suggestions only now, and the condition that decides whether it
is drawn had to lose its attachment clause with them: it asks the same question
its children do, so a message whose only "badge" was a file would otherwise have
left an empty flex row spending the header's gap.

What an attachment can *do* did not change, and is now written once rather than
per presentation. `components/useAttachmentActions.ts` holds the two requests,
the busy flag they share and whether the worp relay may be offered at all (worp
takes this kind of file *and* worp is configured), and
`components/AttachmentMenuContent.tsx` is the menu both faces open. The inbox
row keeps the compact display — `MessageAttachments` → `AttachmentPill`, capped
at three with a `+n`, the name clipped to what a row can spare — and the detail
page mounts the rows, which have the width to say the filename in full. Only the
face differs; a new one must not bring a second copy of the actions with it.

Note the seam the download takes: `api/downloadAttachment.ts` calls `fetch`
itself rather than going through `apiFetch`, because what it wants is the blob
and an `<a download>` click, so a suite that exercises it stubs `fetch` *and*
the client.

## Viewing preferences

Two settings are this browser's rather than the install's — the theme and
whether a message's remote images load (#149) — so neither has a schema, an
endpoint or a migration behind it, and they share the Settings page's General
card (`features/settings/GeneralCard.tsx`).

The images one lives in `features/preferences/remoteImages.ts`: the storage key,
the default, a reader that treats anything it does not recognise as the default,
and a `useSyncExternalStore` hook over a listener set, so the settings row and an
open message body cannot disagree. Its default is **show**, which is
deliberately not what Gmail and Apple Mail do: a remote image is the standard
read receipt, and loading one tells the sender the address is live, when it was
opened and roughly from where. The product decision is that the price is paid by
default — which is exactly why the hide path stays, rather than the behaviour
being hardcoded. Do not remove it.

What each state does is one rule in `MessageDetailBody`: under *show* the
message detail renders no remote-images toggle at all (the header would be
asking a question already answered), under *hide* nothing changes from before —
`stripRemoteImages` blanks the `http(s)` sources and the per-message toggle opts
this one message in. Inline `data:` and `cid:` images are never stripped under
either. The frame's image `load`/`error` listeners are what size it once the
images arrive, so they stay load-bearing now that a first render can carry them.

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

- The API is **not** public-facing; it auths every non-`/health` route with a single bearer token (`API_SECRET`). CORS is locked to the web dev server's two dev origins (`http://localhost:5230` and `https://miel.localhost`) by default.
- `bun dev` tees each dev server's stdout/stderr to `logs/api.log` and `logs/web.log` at repo root. Read these directly to see current server/browser-console-adjacent output — no need to attach to the running process. Logs are gitignored and truncate on each `bun dev` restart (`tee`, not `tee -a`).
- `PRD.md` at the repo root is the product spec — useful when planning new features, but it isn't code.
- `CONTRIBUTING.md` is this file's human-facing subset (setup, the four gated checks, the conventions, the vendored-component caveat) and `SECURITY.md` is the disclosure policy; `.github/ISSUE_TEMPLATE/` and `.github/pull_request_template.md` hold the templates. Changing a check, a convention or a setup step means changing `CONTRIBUTING.md` too — `packages/web/src/contributorDocs.test.ts` derives what it asserts from the CI workflow and the landing page's contact constant, so drift fails there.
- What goes to a provider is stated in `packages/core/src/claudeUsage.ts` — batch size (default 15, configurable per install, capped at 50), the 8000-char body truncation, and `BODY_BEARING_TASKS`, the list of tasks that put a whole body in a prompt: drafting a reply and, since #159, the sync's promo extraction. Triage itself sends only sender/subject/snippet/labels; through the CLI the model fetches a body from the local API when it needs one. Four surfaces publish that module and none restates it: the landing page's disclosure, the privacy policy, the README's "What the AI sees" and `SECURITY.md`'s scope list — so change the constants, never a copy. The list is a list because it grew (#158): reply was the only body-bearing task until `promo-extract`, and three documents said "the one request that carries a whole message body". `claude/tasks.test.ts` is what keeps it honest — the tasks whose prompts actually inline the body they were handed must be exactly the published list, so a fifth one fails there until the disclosure names it.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `lucasriondel/miel`, via the `gh` CLI — which is what the `#NN` references throughout this file point at. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context — `CONTEXT-MAP.md` at the root indexes the shared glossary plus one context per package under `packages/*`. See `docs/agents/domain.md`.
