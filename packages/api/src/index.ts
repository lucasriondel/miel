import {
  createDebug,
  createScheduler,
  getEnv,
  markStaleRunsFailed,
  registerScheduler,
  runMigrations,
} from "@miel/core";
import { createApp } from "./app";
import { handleSyncMessage, type SyncSocketData } from "./ws/syncSocket";

const debug = createDebug("api");

process.on("uncaughtException", (err) => {
  debug.error("uncaughtException", { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  debug.error("unhandledRejection", { message: err.message, stack: err.stack });
  process.exit(1);
});

const { API_PORT, API_SECRET, WEB_ORIGIN } = getEnv();

// Portless hands each child it spawns an ephemeral port in `PORT` and registers
// that port behind `api.miel.localhost`; `API_PORT` — the registry's row
// (~/dev/PORTS.md) — is what the package binds when it is run directly
// (`PORTLESS=0 bun dev:app`) and in production. Taking `PORT` first serves both
// off one line: without it the server binds `API_PORT` while the proxy routes to
// the port it handed out, and every request through the hostname answers 502.
const listenPort = Number(process.env.PORT ?? API_PORT);

try {
  await runMigrations();
  debug.info("migrations applied");
} catch (err) {
  debug.error("migrations failed", { error: err });
  process.exit(1);
}

// Any sync/triage rows still marked "running" belong to a previous process that
// crashed/was killed — flip them to failed so the Logs UI doesn't show ghost
// processes as active indefinitely.
try {
  const stale = await markStaleRunsFailed();
  if (stale.syncWindows > 0 || stale.triageRuns > 0) {
    debug.warn("marked stale runs as failed", {
      syncWindows: stale.syncWindows,
      triageRuns: stale.triageRuns,
    });
  }
} catch (err) {
  debug.error("stale-run cleanup failed", { error: err });
}

const app = createApp({ webOrigin: WEB_ORIGIN });

// Automatic-sync scheduler. Reads `schedule.enabled` and
// `schedule.interval_minutes` from `app_settings` on each tick, so toggling the
// schedule takes effect without a restart. Off by default (see settings.ts).
const scheduler = createScheduler();
// Publish the live handle so GET /settings/schedule/status can read last-run
// timings without owning this boot module.
registerScheduler(scheduler);
scheduler.start();

const server = Bun.serve<SyncSocketData>({
  port: listenPort,
  fetch(req, self) {
    const url = new URL(req.url);
    if (url.pathname === "/sync/ws" || url.pathname === "/api/sync/ws") {
      const token = url.searchParams.get("token");
      if (token !== API_SECRET) {
        return new Response("unauthorized", { status: 401 });
      }
      const ok = self.upgrade(req, {
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

debug.info(`listening on http://localhost:${server.port}`);
