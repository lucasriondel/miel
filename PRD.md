# WebSocket sync progress streaming

## Context

Today the web app triggers a sync via `POST /sync`, blocks until the whole pipeline (fetch → triage all batches → suggest filters) finishes, then shows a `SyncStatusBanner` with totals. The user has no visibility into stages, no way to see freshly-fetched mail before triage finishes, and the Claude triage batches run strictly sequentially.

We're replacing this with a WebSocket protocol where the server streams typed progress events for each stage. Triage batches and filter suggestions run **in parallel** within an account. The frontend dispatches each event to a dedicated sonner toast (one per stage) and invalidates React Query caches at the right moments so fetched-but-untriaged mail lands in the existing "Not yet triaged" section immediately. The `POST /sync` route and `SyncStatusBanner` are removed; the CLI keeps working because it calls `syncAll` directly.

## Event schema (shared via `@miel/core`)

New file `packages/core/src/schemas/syncEvents.ts` defines a Zod discriminated union on `type`:

**Client → Server**
- `sync.start` — `{ type, account?, since?, range?, max? }` (refined: not both `since` and `range`)

**Server → Client**
- `sync.started` — `{ type }`
- `mails.fetched` — `{ type, account, count }`
- `triage.started` — `{ type, account, totalBatches }`
- `triage.batch.progress` — `{ type, account, batchIndex, totalBatches, status: "started"|"done"|"failed", error? }`
- `filters.started` — `{ type, account }`
- `triage.finished` — `{ type, account, triaged, suggestedNewLabels }`
- `filters.finished` — `{ type, account, suggestedFilters }`
- `sync.finished` — `{ type, runs: SyncRunResult[] }`
- `sync.error` — `{ type, message }`

Re-export as `syncEventSchemas` from `packages/core/src/index.ts` (mirrors the existing `apiSchemas` pattern). Keep `apiSchemas.SyncRequest` — it stays useful as the payload of `sync.start`. Delete `SyncResponse` from `packages/web/src/api/types.ts`.

## Backend changes

### `packages/api/src/index.ts` — WS upgrade outside Hono

Bun's `server.upgrade()` needs the live `server` instance, which only exists after `Bun.serve()` returns. To avoid the chicken-and-egg with Hono's context, handle `/sync/ws` directly in the top-level `fetch` and delegate everything else to `app.fetch`:

```ts
const app = createApp();
const server = Bun.serve({
  port: API_PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/sync/ws") {
      const token = url.searchParams.get("token");
      if (token !== getEnv().API_SECRET) return new Response("unauthorized", { status: 401 });
      const ok = server.upgrade(req, { data: { started: false } });
      return ok ? undefined : new Response("upgrade failed", { status: 400 });
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws)    { /* wait for sync.start */ },
    message(ws, raw) { handleSyncMessage(ws, raw); },
    close(ws)   { /* mark cancelled */ },
  },
});
```

Auth uses a `?token=` query param (browsers can't set headers on WS). For a single-user local app this is fine; documented as a risk for any future deployment.

### New file `packages/api/src/ws/syncSocket.ts`

Holds `handleSyncMessage(ws, raw)`:
1. Parse with `syncEventSchemas.SyncStartMessage`. Reject if a second `sync.start` arrives.
2. Send `sync.started`.
3. Call `syncAll({ ...input, onEvent: (e) => ws.send(JSON.stringify(e)) })`.
4. Send `sync.finished` with the runs, or `sync.error` on throw.
5. `ws.close(1000)`.

On `close`, set `ws.data.cancelled = true`. No abort plumbing in v1 — the work continues in the background; this is documented as a known limitation.

### Drop the old POST route

- Delete `packages/api/src/routes/sync.ts`.
- Remove the `syncRoutes` import and `app.route("/sync", syncRoutes)` from `packages/api/src/app.ts`.

### `packages/core/src/services/sync.ts` — events + parallelism

**Add a typed `onEvent` alongside the existing `log` callback.** Both can coexist — the CLI keeps using `log`, the WS handler uses `onEvent`. No behavioral change for the CLI.

**Emit at these points in `fetchAndTriage` (current line numbers for orientation):**
- After `upsertMessages(normalized)` (line 409): `mails.fetched`. Rows are in the DB with `priority=null`, ready to render in the untriaged section.
- After `chunk(normalized, ...)` (line 439): `triage.started` with `totalBatches`.
- Before/after each batch's claude call: `triage.batch.progress` with `started` / `done` / `failed`.
- Before the filter suggest call (line 512): `filters.started`.
- After all triage batches resolve: `triage.finished`.
- After filters resolve: `filters.finished`.

`sync.started` / `sync.finished` / `sync.error` are emitted by the WS wrapper, NOT by `fetchAndTriage`.

**Parallelize triage batches AND the filter suggestion call.** Extract `runTriageBatch(batch, i)` returning `{ persisted, newLabelSuggestions, errors }` (no shared mutation). Then:

```ts
const batchPromise = Promise.allSettled(
  batches.map((batch, i) => runTriageBatch(batch, i)),
);
const filterPromise = runFilterSuggest();  // wraps the existing try/catch around suggestFiltersForBatch
const [batchResults, filterResult] = await Promise.all([batchPromise, filterPromise]);
```

After the awaits, reduce the per-batch results into `triagedCount`, `suggestedNewLabelsCount`, and `errors`. `Promise.allSettled` for batches so one failure doesn't poison the rest (matches today's catch behavior). Filter suggestions are correctness-safe in parallel: they depend only on `normalized` + `labelsByGmailId`, both ready before line 432.

`syncAll` gets the same `onEvent?` option and forwards it.

## Frontend changes

### New hook `packages/web/src/api/syncSocket.ts`

`useSyncStream()` exposes `{ start, isRunning }`:

```ts
ws = new WebSocket(buildSyncWsUrl());      // ws://host/api/sync/ws?token=<apiSecret>
ws.onopen    = () => ws.send(JSON.stringify({ type: "sync.start", ...input }));
ws.onmessage = (ev) => dispatch(SyncEvent.safeParse(JSON.parse(ev.data)).data, qc);
ws.onerror   = () => toast.error("Sync connection error");
ws.onclose   = () => setIsRunning(false);
```

URL builder picks `wss:` when the page is `https:`. Vite's `/api` proxy auto-upgrades WS requests, so dev works without config changes.

**Event → toast dispatcher** (one toast per stage, stable IDs scoped per `(account, stage)`):

| Event | Toast | Side effect |
|---|---|---|
| `sync.started` | (none — button spinner covers it) | — |
| `mails.fetched` | `toast.info("Found N new mails for <account>")` | invalidate `["messages"]` |
| `triage.started` | `toast.loading("Claude is triaging your mails…", { id: \`sync:triage:${account}\` })` | — |
| `triage.batch.progress` | update the triage toast's description: `${done}/${total} batches` (counters in a `useRef`) | — |
| `filters.started` | `toast.loading("Claude is finding potential new filters…", { id: \`sync:filters:${account}\` })` | — |
| `triage.finished` | dismiss `sync:triage:${account}`, then `toast.success("Claude finished triaging <account>")` | invalidate `["messages"]` and `accounts` |
| `filters.finished` | dismiss `sync:filters:${account}`, then `toast.success("Filters: N suggestions")` | invalidate `["filters"]` |
| `sync.finished` | (none) | final `accounts` invalidate |
| `sync.error` | `toast.error(\`Sync failed: ${message}\`)` | — |

No reconnection logic in v1. Reauth detection over WS is deferred (reauth errors still surface today via the HTTP API for label/reply mutations, which is the main path).

### `SyncRangeControls.tsx`

Drop the `onResult` / `onError` props. Swap `useSync()` for `useSyncStream()`. `sync.mutate(...)` → `start(...)`. `sync.isPending` → `isRunning`.

### Delete `SyncStatusBanner.tsx` and its plumbing

- Delete `packages/web/src/features/sync/SyncStatusBanner.tsx`.
- In `packages/web/src/App.tsx`: remove `syncStatus`, `onSyncResult`, `onSyncError`, `dismissSyncStatus` from `LayoutContext`, the `useState<SyncStatus>`, and the three handlers. Trim the `useMemo` deps.
- In `packages/web/src/pages/InboxPage.tsx`: remove the `SyncStatusBanner` import + JSX, the destructured fields, and the props passed to `<SyncRangeControls>`.
- In `packages/web/src/pages/MessageDetailPage.tsx`: same cleanup pattern.

### `SettingsSyncTrigger.tsx`

Swap to `useSyncStream()`. Drop the per-run summary table (toasts cover it). Keep `isRunning` for the button.

### Cleanup

- Remove `useSync` and `SyncInput` from `packages/web/src/api/mutations.ts`.
- Remove `SyncResponse` from `packages/web/src/api/types.ts`. Keep `SyncRunResult` — still used by the `sync.finished` event payload.

## Files

**Create**
- `packages/core/src/schemas/syncEvents.ts`
- `packages/api/src/ws/syncSocket.ts`
- `packages/web/src/api/syncSocket.ts`

**Modify**
- `packages/core/src/index.ts` (export `syncEventSchemas`)
- `packages/core/src/services/sync.ts`
- `packages/api/src/index.ts`
- `packages/api/src/app.ts`
- `packages/web/src/App.tsx`
- `packages/web/src/pages/InboxPage.tsx`
- `packages/web/src/pages/MessageDetailPage.tsx`
- `packages/web/src/features/sync/SyncRangeControls.tsx`
- `packages/web/src/features/settings/SettingsSyncTrigger.tsx`
- `packages/web/src/api/mutations.ts`
- `packages/web/src/api/types.ts`

**Delete**
- `packages/api/src/routes/sync.ts`
- `packages/web/src/features/sync/SyncStatusBanner.tsx`

**Untouched (verify still work)**
- `packages/cli/src/commands/sync.ts` — uses `log`, not affected
- `packages/web/vite.config.ts` — `/api` proxy auto-upgrades WS

## Implementation order

1. ~~Add `schemas/syncEvents.ts` + core export. Type-only.~~ ✅ Done 2026-05-21.
2. ~~Add `onEvent` to `fetchAndTriage` and `syncAll`, emit at the labeled points (no parallelism yet). Run the CLI to confirm log output unchanged.~~ ✅ Done 2026-05-21.
3. Parallelize triage batches + filter suggest. Re-run CLI; totals should match the sequential run.
4. Add the WS handler in `api/index.ts` + `api/ws/syncSocket.ts`. Smoke-test with `wscat -c "ws://localhost:3001/sync/ws?token=$API_SECRET"` sending `{"type":"sync.start","since":"1d"}` and watching events stream.
5. Add `useSyncStream`, wire `SyncRangeControls`. Verify toasts.
6. Delete `SyncStatusBanner`, the POST route, `useSync`, `SyncResponse`. Trim `LayoutContext`, `InboxPage`, `MessageDetailPage`, `SettingsSyncTrigger`. Run `bun run typecheck`.

## Verification

1. `bun run dev`, open `http://localhost:3000`, pick an account with unsynced mail.
2. Click **Sync** (preset `1d`). Observe in order:
   - Button shows spinner + "Syncing…".
   - Info toast: "Found N new mails…".
   - Inbox "Not yet triaged" section populates with those N rows.
   - Loading toast: "Claude is triaging…" (description updates as batches finish).
   - Loading toast: "Claude is finding potential new filters…" (concurrent with triage).
   - Success toast: "Claude finished triaging…". Untriaged rows re-grouped under high/medium/low.
   - Success toast: "Filters: N suggestions".
   - Button returns to idle.
3. Multi-account run: trigger via Settings with no account filter; verify per-account toast IDs stay independent and don't clobber each other.
4. Failure path: temporarily break `CLAUDE_BIN`; per-batch failures appear as `triage.batch.progress` with `status: "failed"`; the final triage success toast still fires but the underlying `SyncRunResult.errors` is populated.
5. CLI regression: `bun --filter @miel/cli dev sync --account <email> --since 1d` — log output unchanged.
6. Devtools → Network → WS tab: confirm one open frame and the event stream.

## Risks

- **Vite WS proxy:** auto-upgrades in practice; if not, add `ws: true` to the `/api` proxy entry in `vite.config.ts`.
- **Cancellation:** closing the WS mid-sync does NOT abort in-flight gog/claude calls in v1. Acceptable; plumb `AbortSignal` later if it matters.
- **API_SECRET in URL:** token appears in browser history and server logs. Fine for a local single-user app; switch to a short-lived ticket endpoint if ever deployed.
- **Multi-tab:** two tabs = two WS = two syncs. DB writes are idempotent (upserts) and `lastSyncedAt` is last-writer-wins. Acceptable.
