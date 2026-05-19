# Miel — Gmail Triage System

## Context

Build an end-to-end Gmail triage system in this empty Bun + Turborepo monorepo (`/Users/lucas/miel`). The system fetches messages from multiple `gog`-authorized Gmail accounts, sends them in batches to `claude -p` for priority classification (high/medium/low) and label suggestions (apply existing / propose new), stores everything in a local Postgres, and surfaces it through a React dashboard that can apply labels, archive, trash, and generate AI-assisted replies (all routed back to Gmail via `gog`).

The repo already has four stub packages (`@miel/core`, `@miel/api`, `@miel/cli`, `@miel/web`). `gog` (`/opt/homebrew/bin/gog`, v0.9.0) is installed and authorized for `lucasriondelpro@gmail.com`. Docker 28 + Compose v2 are installed. `claude -p` supports `--output-format=json` and `--json-schema='<schema>'`, so we can constrain output structure directly without a parser.

Decisions confirmed:
- Triage = batched 15/call. Sync = synchronous. Web = Vite. Reply schema = `{subject, body}`.
- Accounts auto-synced from `gog auth list`. Default window = 7d. Archive/trash hit Gmail immediately.
- API auth = shared bearer secret. HTML body = sandboxed iframe. Styling = Tailwind.
- Claude model is **configurable per-task** via a Settings page (DB-stored). Defaults: Haiku 4.5 for triage, Sonnet 4.6 for reply.

---

## Library choices

| Concern | Pick | Why (one line) |
|---|---|---|
| ORM | `drizzle-orm` ^0.36 | Type-safe, Bun-friendly, integrates with zod via `drizzle-zod`. |
| Migrations | `drizzle-kit` ^0.30 | First-party migrator. |
| PG driver | `postgres` ^3.4 | Drizzle's recommended Bun-compatible client. |
| Validation | `zod` ^3.23 | Stay on v3 for compatibility with `zod-to-json-schema` and `drizzle-zod`. |
| zod→JSON Schema | `zod-to-json-schema` ^3.23 | Emits the draft-07 JSON that `claude -p --json-schema` accepts. |
| API framework | `hono` ^4.6 | Bun-native, typed routes, easy CORS + bearer middleware. |
| CLI parser | `commander` ^12 | Just enough for 4 commands. |
| Query client | `@tanstack/react-query` ^5 | Standard fetch/cache/mutation primitive. |
| Router | `react-router` ^7 (data router) | Smallest router with nested layouts. |
| Web bundler | Vite ^6 + `@vitejs/plugin-react` | User-selected; mature React HMR; proxies API to :3001. |
| Styling | Tailwind ^3.4 + postcss + autoprefixer | Fast iteration, no CSS files to manage. |
| Date | `date-fns` ^4 | `--since=7d` parsing. |

---

## Repo layout (new files)

```
/Users/lucas/miel/
  docker-compose.yml
  .env.example
  drizzle.config.ts
  packages/
    core/        # shared schemas, db, adapters, services
    api/         # hono server on :3001
    cli/         # commander CLI (`miel`)
    web/         # Vite + React on :3000
```

---

## `packages/core`

```
src/
  index.ts                      # re-exports
  env.ts                        # zod-parsed process.env (DATABASE_URL, GOG_BIN, CLAUDE_BIN, API_SECRET)
  db/
    client.ts                   # drizzle(postgres(DATABASE_URL))
    schema.ts                   # ALL tables + enums + relations
    migrate.ts                  # programmatic migrate runner
  schemas/
    gmail.ts                    # GogAccount, GogMessage, GogLabel zod schemas (parses gog --json output)
    triage.ts                   # TriageInput, TriageOutput (claude triage I/O)
    reply.ts                    # ReplyGenInput, ReplyGenOutput
    api.ts                      # all REST request/response zod schemas
  adapters/
    shell.ts                    # Bun.spawn helper -> stdout JSON
    gog.ts                      # typed wrapper over the gog binary
    claude.ts                   # typed wrapper over claude -p (per-task model from settings)
  services/
    sync.ts                     # fetchAndTriage(accountEmail, since)
    labels.ts                   # ensureLabel(account, name)
    apply.ts                    # apply suggested labels (create+attach via gog)
    reply.ts                    # generateReply, sendReply
    settings.ts                 # get/set model preferences (key/value table)
    accounts.ts                 # syncAccountsFromGog()
  util/
    time.ts                     # parseSince("7d") -> "newer_than:7d"
    html.ts                     # strip + decode for body preview
```

### Drizzle schema (`packages/core/src/db/schema.ts`)

Tables: `accounts`, `labels`, `messages`, `message_labels`, `triages`, `triage_label_suggestions`, `suggested_labels`, `app_settings`.

```ts
import { pgTable, pgEnum, uuid, text, timestamp, boolean, jsonb, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", ["pending", "applied", "dismissed"]);

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
});

export const labels = pgTable("labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  gmailLabelId: text("gmail_label_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("user"),  // "user" | "system"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byAccountGmailId: uniqueIndex("labels_account_gmail_id").on(t.accountId, t.gmailLabelId),
  byAccountName: index("labels_account_name").on(t.accountId, t.name),
}));

export const messages = pgTable("messages", {
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  gmailMessageId: text("gmail_message_id").notNull(),
  gmailThreadId: text("gmail_thread_id").notNull(),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  toEmails: jsonb("to_emails").$type<string[]>().notNull().default([]),
  subject: text("subject"),
  snippet: text("snippet"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  internalDate: timestamp("internal_date", { withTimezone: true }).notNull(),
  rawHeaders: jsonb("raw_headers").$type<Record<string, string>>(),
  isArchived: boolean("is_archived").notNull().default(false),
  isTrashed: boolean("is_trashed").notNull().default(false),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.accountId, t.gmailMessageId] }),
  byThread: index("messages_thread").on(t.accountId, t.gmailThreadId),
  byDate: index("messages_internal_date").on(t.internalDate),
}));

export const messageLabels = pgTable("message_labels", {
  accountId: uuid("account_id").notNull(),
  gmailMessageId: text("gmail_message_id").notNull(),
  labelId: uuid("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.accountId, t.gmailMessageId, t.labelId] }),
}));

export const triages = pgTable("triages", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull(),
  gmailMessageId: text("gmail_message_id").notNull(),
  priority: priorityEnum("priority").notNull(),
  reasoning: text("reasoning").notNull(),
  claudeRunId: text("claude_run_id"),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byMsg: index("triages_msg").on(t.accountId, t.gmailMessageId, t.createdAt),
}));

export const triageLabelSuggestions = pgTable("triage_label_suggestions", {
  triageId: uuid("triage_id").notNull().references(() => triages.id, { onDelete: "cascade" }),
  labelId: uuid("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
  status: suggestionStatusEnum("status").notNull().default("pending"),
}, (t) => ({
  pk: primaryKey({ columns: [t.triageId, t.labelId] }),
}));

export const suggestedLabels = pgTable("suggested_labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  triageId: uuid("triage_id").notNull().references(() => triages.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  reasoning: text("reasoning"),
  status: suggestionStatusEnum("status").notNull().default("pending"),
  createdLabelId: uuid("created_label_id").references(() => labels.id),
});

// key/value for per-task model selection ("triage.model" -> "claude-haiku-4-5", etc.)
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### Zod schemas

```ts
// schemas/triage.ts
export const Priority = z.enum(["high", "medium", "low"]);

export const TriageInputItem = z.object({
  id: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  body: z.string(),                  // first ~4000 chars of bodyText
  internalDate: z.string(),
  currentLabels: z.array(z.string()),
});

export const TriageInput = z.object({
  account: z.string().email(),
  existingLabels: z.array(z.string()),
  messages: z.array(TriageInputItem).min(1).max(20),
});

export const TriageOutputItem = z.object({
  id: z.string(),
  priority: Priority,
  reasoning: z.string(),
  applyExistingLabels: z.array(z.string()),
  suggestNewLabels: z.array(z.object({
    name: z.string().min(1).max(40),
    reasoning: z.string(),
  })),
});

export const TriageOutput = z.object({ results: z.array(TriageOutputItem) });
```

```ts
// schemas/reply.ts
export const ReplyGenInput = z.object({
  from: z.string(), to: z.array(z.string()), subject: z.string().nullable(),
  body: z.string(), userInstruction: z.string(),
});
export const ReplyGenOutput = z.object({ subject: z.string(), body: z.string() });
```

### `gog` adapter (`packages/core/src/adapters/gog.ts`)

```ts
export interface GogAdapter {
  listAccounts(): Promise<GogAccount[]>;
  searchMessages(o: { account: string; query: string; max?: number }): Promise<{ messageId: string; threadId: string }[]>;
  getMessage(o: { account: string; messageId: string }): Promise<GogMessage>;
  listLabels(o: { account: string }): Promise<GogLabel[]>;
  createLabel(o: { account: string; name: string }): Promise<GogLabel>;
  batchModifyLabels(o: { account: string; messageIds: string[]; add?: string[]; remove?: string[] }): Promise<void>;
  trashThread(o: { account: string; threadId: string }): Promise<void>;
  archiveThread(o: { account: string; threadId: string }): Promise<void>;  // = thread modify --remove=INBOX
  sendReply(o: { account: string; to: string[]; subject: string; body: string; replyToMessageId: string }): Promise<{ messageId: string }>;
}
```

All commands shell out via `Bun.spawn` with `--json`; output is run through the matching zod schema in `schemas/gmail.ts`.

### `claude` adapter (`packages/core/src/adapters/claude.ts`)

```ts
export interface ClaudeAdapter {
  runTriage(input: TriageInputT): Promise<{ output: TriageOutputT; runId: string; model: string }>;
  generateReply(input: ReplyGenInputT): Promise<{ output: ReplyGenOutputT; runId: string; model: string }>;
}
```

Internals:
- Reads model from `app_settings` (`triage.model`, `reply.model`); defaults `claude-haiku-4-5` and `claude-sonnet-4-6`.
- Spawns `claude -p --output-format=json --model=<m> --json-schema='<json>' '<prompt>'`.
- Parses outer JSON envelope → `result` string → `JSON.parse` → zod `.parse(...)`.
- Triage prompt embeds JSON-stringified `TriageInput` and instructs Claude to return one entry per input id in `results`.

---

## `packages/api`

```
src/
  index.ts                      # Bun.serve({ fetch: app.fetch, port: 3001 })
  app.ts                        # Hono app: CORS, bearer auth, routes
  middleware/
    auth.ts                     # checks Authorization: Bearer ${API_SECRET}
    error.ts                    # JSON error responses
  routes/
    accounts.ts                 # GET /accounts, POST /accounts/sync (re-pulls from gog auth list)
    labels.ts                   # GET /accounts/:id/labels, POST /labels
    messages.ts                 # list/get/labels/archive/trash
    sync.ts                     # POST /sync (synchronous)
    reply.ts                    # generate + send
    settings.ts                 # GET/PUT /settings  (model selections)
  deps.ts                       # imports services from @miel/core
```

### Routes

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/accounts` | — | `Account[]` |
| POST | `/accounts/sync` | — | `{ accounts: Account[] }` (calls gog auth list, upserts) |
| GET | `/accounts/:accountId/labels` | — | `Label[]` |
| POST | `/labels` | `{ accountId, name }` | `Label` (creates remote via gog) |
| GET | `/messages` | `?account=&priority=&label=&limit=&cursor=` | `{ items, nextCursor }` (joins latest triage) |
| GET | `/messages/:accountId/:gmailMessageId` | — | full detail + triage history |
| POST | `/sync` | `{ account?, since?: "7d" }` | `{ runs: { account, fetched, triaged, errors }[] }` |
| POST | `/messages/:accountId/:gmailMessageId/labels` | `{ add?, remove? }` (label UUIDs) | `{ ok: true }` |
| POST | `/messages/:accountId/:gmailMessageId/apply-suggestions` | `{ triageId, acceptExistingLabelIds?, acceptNewSuggestionIds? }` | `{ ok, createdLabels }` |
| POST | `/messages/:accountId/:gmailMessageId/archive` | — | `{ ok: true }` |
| DELETE | `/messages/:accountId/:gmailMessageId` | — (trash) | `{ ok: true }` |
| POST | `/messages/:accountId/:gmailMessageId/generate-reply` | `{ prompt }` | `{ subject, body }` |
| POST | `/messages/:accountId/:gmailMessageId/send-reply` | `{ subject, body }` | `{ ok, sentMessageId }` |
| GET | `/settings` | — | `{ triageModel, replyModel }` |
| PUT | `/settings` | `{ triageModel?, replyModel? }` | updated settings |

Auth: every route except a health check requires `Authorization: Bearer ${API_SECRET}`. CORS allows `http://localhost:3000`.

---

## `packages/cli`

```
src/
  index.ts                      # commander entry
  commands/
    sync.ts                     # miel sync [--account=X] [--since=7d]
    apply.ts                    # miel apply --message-id=accountId:gmailMsgId
    reply.ts                    # miel reply --message-id=... --prompt="..."
    accounts.ts                 # miel accounts list | sync
    db.ts                       # miel db migrate
```

CLI commands are thin wrappers around `@miel/core/services`.

---

## `packages/web` (Vite + React 19 + Tailwind)

```
vite.config.ts                  # @vitejs/plugin-react; proxy /api -> http://localhost:3001
index.html                      # root div + module script
postcss.config.cjs              # tailwind + autoprefixer
tailwind.config.ts              # content: ["./src/**/*.{ts,tsx}"]
src/
  main.tsx                      # bootstrap (QueryClientProvider + RouterProvider)
  App.tsx                       # layout (sidebar + outlet)
  router.tsx                    # createBrowserRouter
  index.css                     # @tailwind directives
  config.ts                     # reads VITE_API_BASE, VITE_API_SECRET
  api/
    client.ts                   # fetch wrapper (adds Bearer header)
    queries.ts                  # useAccounts, useMessages, useMessage, useLabels, useSettings
    mutations.ts                # useSync, useApplyLabels, useApplySuggestions, useArchive, useTrash, useGenerateReply, useSendReply, useCreateLabel, useUpdateSettings
  components/
    Sidebar.tsx
    AccountPicker.tsx
    LabelList.tsx
    PrioritySection.tsx
    MessageRow.tsx
    LabelBadge.tsx
    SuggestedLabelBadge.tsx
    Spinner.tsx
    Button.tsx
    EmptyState.tsx
  pages/
    InboxPage.tsx               # / — messages grouped by priority for selected account
    MessageDetailPage.tsx       # /messages/:accountId/:gmailMessageId
    SettingsPage.tsx            # /settings — model picker, accounts, labels, sync button
  features/
    message-detail/
      MessageDetailHeader.tsx
      MessageDetailBody.tsx     # sandboxed <iframe srcdoc={bodyHtml} sandbox="">
      MessageActions.tsx        # archive / trash / reply
      SuggestedLabelsPanel.tsx
      TriageHistoryPanel.tsx
    reply/
      ReplyComposer.tsx         # prompt textarea + Generate button
      ReplyDraftView.tsx        # editable subject + body + Send
    sync/
      SyncButton.tsx
      SyncStatusBanner.tsx
    settings/
      ModelPicker.tsx           # one selector per task ("triage", "reply")
      AccountsManager.tsx
      LabelsManager.tsx
```

Tree at runtime:

```
<App>
  <Sidebar>           AccountPicker, LabelList, SyncButton
  <Outlet>
    InboxPage         SyncStatusBanner, PrioritySection×3 → MessageRow → LabelBadge + SuggestedLabelBadge
    MessageDetailPage MessageDetailHeader, MessageDetailBody (sandboxed iframe),
                      MessageActions, SuggestedLabelsPanel, TriageHistoryPanel,
                      ReplyComposer → ReplyDraftView
    SettingsPage      ModelPicker (triage), ModelPicker (reply), AccountsManager, LabelsManager
```

Vite dev proxy maps `/api/*` → `http://localhost:3001/*` so the bearer secret never enters the browser bundle directly — `client.ts` reads `VITE_API_SECRET` from `.env.local`.

---

## Triage chunking

- 15 messages per `claude -p` call.
- Body truncated to first 4000 chars.
- Output array matched by `id` (not index); a warning is logged if Claude drops or adds entries.
- Calls are sequential within a sync; accounts processed sequentially.

## Apply suggested new label

```
1. SELECT name FROM suggested_labels WHERE id=$1
2. gog.createLabel({account, name})         -> { gmailLabelId, name }
3. INSERT INTO labels ON CONFLICT (account_id, gmail_label_id) DO UPDATE
4. UPDATE suggested_labels SET status='applied', created_label_id=...
5. gog.batchModifyLabels({account, messageIds:[msgId], add:[gmailLabelId]})
6. INSERT INTO message_labels ON CONFLICT DO NOTHING
```

Applying an existing-label suggestion skips steps 2-4.

---

## Docker compose + env

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    container_name: miel-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: miel
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-miel}
      POSTGRES_DB: miel
    ports: ["5432:5432"]
    volumes: [miel-pgdata:/var/lib/postgresql/data]
volumes:
  miel-pgdata:
```

`.env.example`:
```
DATABASE_URL=postgres://miel:miel@localhost:5432/miel
POSTGRES_PASSWORD=miel
GOG_BIN=/opt/homebrew/bin/gog
CLAUDE_BIN=claude
API_PORT=3001
WEB_PORT=3000
API_SECRET=change-me-to-a-random-string
VITE_API_BASE=/api
VITE_API_SECRET=change-me-to-a-random-string
```

`drizzle.config.ts` (root):
```ts
import type { Config } from "drizzle-kit";
export default {
  schema: "./packages/core/src/db/schema.ts",
  out: "./packages/core/drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

---

## Implementation order

1. **Infra** ✅ DONE: deps added to each `package.json`, `docker-compose.yml`, `.env.example`, `drizzle.config.ts` written. `bun install` + `bun run typecheck` + `docker compose config` all clean.
2. **DB schema + first migration** ✅ DONE: `env.ts`, `db/schema.ts`, `db/client.ts`, `db/migrate.ts` written; root `drizzle-kit`/`drizzle-orm`/`postgres` devDeps added so `bunx drizzle-kit generate` resolves; compose port remapped 5432→5435 to avoid a conflict with another local Postgres; migration `0000_loving_lyja.sql` applied — verified 8 tables + 2 enums via `\dt`/`\dT+`.
3. **gog adapter + gmail zod schemas**. Smoke test: `gog.listAccounts()`, `gog.searchMessages({query:"newer_than:7d", max:5})`, `gog.getMessage(...)`.
4. **claude adapter + triage/reply zod schemas + settings service** (defaults seeded on first read). Hand-feed a fake TriageInput; verify parsed TriageOutput.
5. **sync service**: account upsert from `gog auth list` → labels sync → message search → upsert → triage chunks of 15 → write `triages` + `triage_label_suggestions` + `suggested_labels`. Verify via CLI then `SELECT priority, count(*) FROM triages GROUP BY priority`.
6. **CLI commands**: sync, accounts, apply, reply, db migrate.
7. **API server**: read-only routes first, then mutations, then reply, then settings. Verify with `curl -H "Authorization: Bearer $API_SECRET" http://localhost:3001/messages?priority=high`.
8. **Web shell**: Vite + Tailwind + router + QueryClient + auth-aware fetch wrapper. Build Sidebar, Inbox + PrioritySection + MessageRow.
9. **Detail page**: header, sandboxed iframe body, suggestions panel, history.
10. **Actions**: archive, trash mutations.
11. **Reply composer**: ReplyComposer + ReplyDraftView; generate + send.
12. **Settings page**: ModelPicker (one per task), accounts manager, labels manager, sync trigger.
13. **Polish**: loading / empty / error states, root `bun dev` via Turbo running api + web.

---

## Critical files to modify or create

- `/Users/lucas/miel/docker-compose.yml`
- `/Users/lucas/miel/.env.example`
- `/Users/lucas/miel/drizzle.config.ts`
- `/Users/lucas/miel/packages/core/src/db/schema.ts`
- `/Users/lucas/miel/packages/core/src/adapters/gog.ts`
- `/Users/lucas/miel/packages/core/src/adapters/claude.ts`
- `/Users/lucas/miel/packages/core/src/services/sync.ts`
- `/Users/lucas/miel/packages/core/src/services/apply.ts`
- `/Users/lucas/miel/packages/core/src/services/reply.ts`
- `/Users/lucas/miel/packages/core/src/services/settings.ts`
- `/Users/lucas/miel/packages/core/src/schemas/triage.ts`
- `/Users/lucas/miel/packages/core/src/schemas/reply.ts`
- `/Users/lucas/miel/packages/api/src/app.ts`
- `/Users/lucas/miel/packages/cli/src/index.ts`
- `/Users/lucas/miel/packages/web/vite.config.ts`
- `/Users/lucas/miel/packages/web/src/router.tsx`
- `/Users/lucas/miel/packages/web/src/pages/InboxPage.tsx`
- `/Users/lucas/miel/packages/web/src/pages/MessageDetailPage.tsx`
- `/Users/lucas/miel/packages/web/src/pages/SettingsPage.tsx`
- `/Users/lucas/miel/packages/web/src/features/reply/ReplyComposer.tsx`
- `/Users/lucas/miel/packages/web/src/features/settings/ModelPicker.tsx`

## Reused existing utilities

Nothing significant — the repo is a skeleton. The placeholder `greet()` in `@miel/core` is dropped. The existing `Bun.serve` in `packages/api/src/index.ts` is replaced with a Hono mount. The existing `App.tsx` in `packages/web` is replaced with the new router-aware version.

---

## Verification (end-to-end happy path)

```bash
cd /Users/lucas/miel
cp .env.example .env                                 # set API_SECRET to a random string

# 1. Infra
docker compose up -d
bun install
bunx drizzle-kit generate
bun run packages/core/src/db/migrate.ts              # creates 8 tables

# 2. Account import
gog auth list --json                                 # confirms lucasriondelpro@gmail.com is authorized
bun packages/cli/src/index.ts accounts sync          # upserts accounts row

# 3. First triage
bun packages/cli/src/index.ts sync --account=lucasriondelpro@gmail.com --since=7d
# expect "Fetched N messages, ran ceil(N/15) triage batches, suggested K new labels"

psql $DATABASE_URL -c "SELECT priority, count(*) FROM triages GROUP BY priority;"
psql $DATABASE_URL -c "SELECT name FROM suggested_labels WHERE status='pending';"

# 4. API
bun --filter @miel/api dev                           # :3001
curl -H "Authorization: Bearer $API_SECRET" http://localhost:3001/messages?priority=high

# 5. Web
bun --filter @miel/web dev                           # :3000 (Vite proxy /api -> :3001)

# 6. Click-through
# - Open http://localhost:3000
# - Inbox: 3 priority groups appear with messages
# - Open a high-priority message
# - "Apply suggested labels" -> verify label appears in Gmail web UI
# - "Archive" -> message disappears from Gmail INBOX
# - On a different message: type "Decline politely, I'm on vacation until June" -> Generate
# - Edit subject + body in draft view -> Send -> verify reply appears in Gmail Sent, threaded
# - Settings -> change triage model to Sonnet -> sync again -> verify triages.model column reflects the change
```
