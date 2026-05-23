import { getEnv, runMigrations } from "@miel/core";
import { createApp } from "./app";
import { handleSyncMessage, type SyncSocketData } from "./ws/syncSocket";

const { API_PORT, API_SECRET, WEB_ORIGIN } = getEnv();

try {
  await runMigrations();
  console.log("miel api: migrations applied");
} catch (err) {
  console.error("miel api: migrations failed", err);
  process.exit(1);
}

const app = createApp({ webOrigin: WEB_ORIGIN });

const server = Bun.serve<SyncSocketData>({
  port: API_PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/sync/ws" || url.pathname === "/api/sync/ws") {
      const token = url.searchParams.get("token");
      if (token !== API_SECRET) {
        return new Response("unauthorized", { status: 401 });
      }
      const ok = server.upgrade(req, {
        data: { started: false, cancelled: false } satisfies SyncSocketData,
      });
      return ok ? undefined : new Response("upgrade failed", { status: 400 });
    }
    return app.fetch(req);
  },
  websocket: {
    open() {
      // Wait for a sync.start message before doing anything.
    },
    message(ws, raw) {
      void handleSyncMessage(ws, raw);
    },
    close(ws) {
      ws.data.cancelled = true;
    },
  },
});

console.log(`miel api listening on http://localhost:${server.port}`);
