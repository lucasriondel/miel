import type { ServerWebSocket } from "bun";
import {
  ReauthRequiredError,
  syncAll,
  syncEventSchemas,
  triageUntriagedForAccount,
} from "@miel/core";
import type { z } from "zod";

type SyncServerEventT = z.infer<typeof syncEventSchemas.SyncServerEvent>;

export interface SyncSocketData {
  started: boolean;
  cancelled: boolean;
}

type SyncWs = ServerWebSocket<SyncSocketData>;

function send(ws: SyncWs, event: SyncServerEventT) {
  ws.send(JSON.stringify(event));
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
      message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
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

async function runSync(
  ws: SyncWs,
  input: z.infer<typeof syncEventSchemas.SyncStartMessage>,
) {
  send(ws, { type: "sync.started" });
  try {
    const runs = await syncAll({
      accountEmail: input.account,
      since: input.since,
      range: input.range,
      max: input.max,
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
      // Safety net (PRD decision 16): a ReauthRequiredError should be handled
      // per-account inside syncAll, but if one ever escapes, surface it as a
      // signal-only reauth event rather than a generic sync.error.
      if (err instanceof ReauthRequiredError) {
        send(ws, { type: "sync.reauth_required", account: err.account });
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

async function runTriage(
  ws: SyncWs,
  input: z.infer<typeof syncEventSchemas.TriageStartMessage>,
) {
  send(ws, { type: "sync.started" });
  try {
    await triageUntriagedForAccount({
      accountEmail: input.account,
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
      send(ws, {
        type: "sync.error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    if (ws.readyState === 1) {
      ws.close(1000);
    }
  }
}
