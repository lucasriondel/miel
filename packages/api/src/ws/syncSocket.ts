import type { ServerWebSocket } from "bun";
import { syncAll, syncEventSchemas } from "@miel/core";
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

  const result = syncEventSchemas.SyncStartMessage.safeParse(parsed);
  if (!result.success) {
    send(ws, {
      type: "sync.error",
      message: `invalid sync.start payload: ${result.error.message}`,
    });
    return;
  }

  ws.data.started = true;
  const input = result.data;

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
