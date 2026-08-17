import type { ServerWebSocket } from "bun";
import {
  ShellError,
  isProviderUnavailable,
  releaseSyncLock,
  syncAll,
  syncEventSchemas,
  triageUntriagedForAccount,
  tryAcquireSyncLock,
} from "@miel/core";
import type { z } from "zod";

type SyncServerEventT = z.infer<typeof syncEventSchemas.SyncServerEvent>;

const RECONNECT_TAGS = new Set(["TokenRefreshError", "GmailAuthError", "AccountNotConnectedError"]);

export interface SyncSocketData {
  started: boolean;
  cancelled: boolean;
}

type SyncWs = ServerWebSocket<SyncSocketData>;

function send(ws: SyncWs, event: SyncServerEventT) {
  ws.send(JSON.stringify(event));
}

/**
 * Renders anything that can reach a `sync.error` as a string.
 *
 * Total on purpose: a shell failure keeps the stderr that carries the useful
 * half, everything else falls through to a branch that cannot call back in. One
 * of the two call sites is the `JSON.parse` catch below, where the error is a
 * SyntaxError produced by whatever bytes a client typed — a branch that fails to
 * terminate there is not an internal edge case but a way to hang the socket, and
 * with it the process (#120).
 */
function syncErrorMessage(err: unknown): string {
  if (err instanceof ShellError && err.stderr) {
    return `${err.message} stderr=${err.stderr}`;
  }
  if (err instanceof Error) {
    return err.message || err.name;
  }
  try {
    return String(err);
  } catch {
    // A thrown value with a null prototype or a throwing toString. Rare, but
    // this function's whole job is having no input it cannot answer.
    return "unknown error";
  }
}

export async function handleSyncMessage(ws: SyncWs, raw: string | Buffer) {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");

  if (ws.data.started) {
    send(ws, { type: "sync.error", message: "sync already started on this connection" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    send(ws, {
      type: "sync.error",
      message: `invalid JSON: ${syncErrorMessage(err)}`,
    });
    return;
  }

  const syncResult = syncEventSchemas.SyncStartMessage.safeParse(parsed);
  if (syncResult.success) {
    ws.data.started = true;
    await runSync(ws, syncResult.data);
    return;
  }

  const triageResult = syncEventSchemas.TriageStartMessage.safeParse(parsed);
  if (triageResult.success) {
    ws.data.started = true;
    await runTriage(ws, triageResult.data);
    return;
  }

  send(ws, {
    type: "sync.error",
    message: `invalid start payload: ${syncResult.error.message}`,
  });
}

async function runSync(ws: SyncWs, input: z.infer<typeof syncEventSchemas.SyncStartMessage>) {
  // Shared with the automatic scheduler: if a run is already in flight, refuse
  // this one rather than double-firing Gmail search + triage against the same
  // account.
  if (!tryAcquireSyncLock()) {
    send(ws, {
      type: "sync.error",
      message: "a sync run is already in progress",
    });
    if (ws.readyState === 1) ws.close(1000);
    return;
  }
  send(ws, { type: "sync.started" });
  try {
    const runs = await syncAll({
      accountEmail: input.account,
      since: input.since,
      range: input.range,
      max: input.max,
      // The Sync button fetches only: pull new mail + sync labels/filters into
      // the DB, no Claude. Triage is a separate manual action (runTriage below).
      triage: false,
      trigger: "manual",
      onEvent: (event) => {
        if (ws.readyState === 1) {
          send(ws, event);
        }
      },
    });
    if (ws.readyState === 1) {
      send(ws, { type: "sync.finished", runs });
    }
  } catch (err) {
    if (ws.readyState === 1) {
      // syncAll handles grant/token failures per-account, but if one escapes,
      // surface the matching signal event rather than a generic sync.error.
      const tag = (err as { _tag?: string })?._tag;
      if (tag && RECONNECT_TAGS.has(tag)) {
        send(ws, { type: "sync.reconnect_required", account: "" });
      } else if (isProviderUnavailable(err)) {
        // Whichever way the provider is unavailable — no token, a rejected one,
        // or a vendor with no stored key — the client gets the one signal that
        // dismisses the hung loaders and points at Settings (#126).
        send(ws, { type: "sync.provider_unavailable", reason: tag });
      } else {
        send(ws, {
          type: "sync.error",
          message: syncErrorMessage(err),
        });
      }
    }
  } finally {
    releaseSyncLock();
    if (ws.readyState === 1) {
      ws.close(1000);
    }
  }
}

async function runTriage(ws: SyncWs, input: z.infer<typeof syncEventSchemas.TriageStartMessage>) {
  send(ws, { type: "sync.started" });
  try {
    await triageUntriagedForAccount({
      accountEmail: input.account,
      trigger: "manual",
      onEvent: (event) => {
        if (ws.readyState === 1) {
          send(ws, event);
        }
      },
    });
    if (ws.readyState === 1) {
      send(ws, { type: "sync.finished", runs: [] });
    }
  } catch (err) {
    if (ws.readyState === 1) {
      // triageUntriagedForAccount lets a provider failure escape (unlike
      // syncAll); surface the same signal instead of a generic sync.error.
      const tag = (err as { _tag?: string })?._tag;
      if (isProviderUnavailable(err)) {
        send(ws, { type: "sync.provider_unavailable", reason: tag });
      } else {
        send(ws, {
          type: "sync.error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    if (ws.readyState === 1) {
      ws.close(1000);
    }
  }
}
