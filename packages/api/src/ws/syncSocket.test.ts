// The sync WebSocket's error path (#120).
//
// Two levels, because the bug had two faces. The first block drives a real
// Bun.serve socket wired exactly as `index.ts` wires it and sends bytes that are
// not JSON — the one call site that needs no privilege at all — and asserts the
// client gets an error and the connection is still usable afterwards. The second
// block calls the handler directly with a fake socket, so the rendering of every
// other error that can reach a `sync.error` (shell failure with stderr, plain
// Error, non-Error throw) is pinned without a database or a Gmail account.
//
// Only the two entry points a start frame calls — `syncAll` and
// `triageUntriagedForAccount` — are swapped out of core (the real module is
// loaded first and spread back), so the Zod schemas, the shared
// provider-unavailable classification and the in-memory sync lock under test are
// the real ones and no Postgres is touched.
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
// Type-only, so it is erased and does not import the module ahead of the mock.
import type { SyncSocketData } from "./syncSocket";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

let syncAllError: unknown = null;
let triageError: unknown = null;

const realCore = await import("@miel/core");
mock.module("@miel/core", () => ({
  ...realCore,
  syncAll: async () => {
    if (syncAllError) throw syncAllError;
    return [];
  },
  triageUntriagedForAccount: async () => {
    if (triageError) throw triageError;
    return {
      account: "user@example.com",
      candidates: 0,
      triaged: 0,
      suggestedNewLabels: 0,
      errors: [],
    };
  },
}));
afterAll(() => mock.restore());

const { ShellError, releaseSyncLock } = realCore;
const { handleSyncMessage } = await import("./syncSocket");

type SyncWs = Parameters<typeof handleSyncMessage>[0];

interface ServerEvent {
  type: string;
  message?: string;
}

afterEach(() => {
  syncAllError = null;
  triageError = null;
  releaseSyncLock();
});

describe("the sync socket, end to end", () => {
  // Mirrors packages/api/src/index.ts: upgrade, then hand every inbound frame to
  // handleSyncMessage without awaiting it.
  const server = Bun.serve<SyncSocketData>({
    port: 0,
    fetch(req, self) {
      const ok = self.upgrade(req, {
        data: { started: false, cancelled: false } satisfies SyncSocketData,
      });
      return ok ? undefined : new Response("upgrade failed", { status: 400 });
    },
    websocket: {
      message(ws, raw) {
        void handleSyncMessage(ws, raw);
      },
    },
  });
  afterAll(() => server.stop(true));

  async function connect(): Promise<{
    send: (text: string) => Promise<ServerEvent>;
    ws: WebSocket;
  }> {
    const ws = new WebSocket(`ws://localhost:${server.port}/sync/ws`);
    const inbox: ServerEvent[] = [];
    let notify: (() => void) | null = null;
    ws.addEventListener("message", (ev: MessageEvent) => {
      inbox.push(JSON.parse(String(ev.data)));
      notify?.();
    });
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("ws error before open")));
    });

    const send = async (text: string) => {
      const before = inbox.length;
      ws.send(text);
      await Promise.race([
        new Promise<void>((resolve) => {
          notify = () => {
            if (inbox.length > before) resolve();
          };
        }),
        Bun.sleep(2000),
      ]);
      const event = inbox[before];
      if (!event) throw new Error("no server event within 2s");
      return event;
    };

    return { send, ws };
  }

  test("malformed JSON is answered with an error and leaves the socket usable", async () => {
    const { send, ws } = await connect();

    const first = await send("this is not json");
    expect(first.type).toBe("sync.error");
    expect(first.message).toContain("invalid JSON");

    expect(ws.readyState).toBe(WebSocket.OPEN);

    // Still usable: the connection answers a second frame rather than hanging.
    const second = await send("{ still not json");
    expect(second.type).toBe("sync.error");

    ws.close();
  });
});

describe("error rendering", () => {
  let ws: SyncWs;
  let sent: ServerEvent[];

  // A fresh socket: `runSync`/`runTriage` close theirs on the way out, so a test
  // that starts a second run needs a new one rather than a reset flag.
  const openSocket = () => {
    const stub = {
      data: { started: false, cancelled: false },
      readyState: 1,
      send: (text: string) => sent.push(JSON.parse(text)),
      close: () => {
        stub.readyState = 3;
      },
    };
    return stub as unknown as SyncWs;
  };

  beforeEach(() => {
    sent = [];
    ws = openSocket();
  });

  const startSync = () => handleSyncMessage(ws, JSON.stringify({ type: "sync.start" }));
  const errorMessage = () => sent.find((e) => e.type === "sync.error")?.message;

  // The exported ShellError is the shell adapter's (positional args), not the
  // same-named Data.TaggedError in errors.ts, which core exports only under the
  // `errors` namespace. `instanceof` in syncSocket.ts is against this one.
  const shellError = (stderr: string) =>
    new ShellError("claude exited 1", 1, stderr, "", ["claude", "-p"]);

  test("a shell failure keeps its stderr appended", async () => {
    syncAllError = shellError("not logged in");

    await startSync();

    expect(errorMessage()).toBe("claude exited 1 stderr=not logged in");
  });

  test("a shell failure with no stderr falls back to its message", async () => {
    syncAllError = shellError("");

    await startSync();

    expect(errorMessage()).toBe("claude exited 1");
  });

  test("an untagged Error is reported by its message", async () => {
    syncAllError = new Error("gmail search failed");

    await startSync();

    expect(errorMessage()).toBe("gmail search failed");
  });

  test("a non-Error throw is stringified", async () => {
    syncAllError = { toString: () => "some object" };

    await startSync();

    expect(errorMessage()).toBe("some object");
  });

  // #126: the socket kept its own two-tag copy of "the provider is unavailable"
  // and never learned the third, so a run stopped by a keyless hosted vendor
  // reached the browser as a bare `sync.error` — no dismissal of the hung
  // loaders, no pointer to Settings.
  describe("a provider that cannot run", () => {
    const startTriage = () =>
      handleSyncMessage(ws, JSON.stringify({ type: "triage.start", account: "user@example.com" }));
    const unavailable = () =>
      sent.find((e) => e.type === "sync.provider_unavailable") as
        | { type: string; reason?: string }
        | undefined;

    test("a run stopped by a keyless hosted vendor is signalled, not reported as an error", async () => {
      syncAllError = new realCore.errors.ProviderNotRunnableError({
        task: "triage",
        provider: "anthropic",
        reason: "missing_provider_credential",
        phase: "run",
      });

      await startSync();

      expect(unavailable()?.reason).toBe("ProviderNotRunnableError");
      expect(errorMessage()).toBeUndefined();
    });

    // #127: the old name survives one release as something a *client* accepts,
    // never as something this server sends — a browser that only learned the new
    // one must not be shown a stale event by a freshly deployed API.
    test("the signal goes out under the new name only", async () => {
      syncAllError = new realCore.errors.ClaudeTokenMissingError();

      await startSync();

      expect(unavailable()).toBeDefined();
      expect(sent.map((e) => e.type)).not.toContain("sync.claude_unavailable");
    });

    test("every tag in the shared set is signalled the same way", async () => {
      for (const tag of realCore.PROVIDER_UNAVAILABLE_TAGS) {
        sent = [];
        ws = openSocket();
        syncAllError = Object.assign(new Error("boom"), { _tag: tag });

        await startSync();
        releaseSyncLock();

        expect({ tag, reason: unavailable()?.reason }).toEqual({ tag, reason: tag });
      }
    });

    test("the manual triage path classifies the same way", async () => {
      triageError = new realCore.errors.ProviderNotRunnableError({
        task: "triage",
        provider: "google",
        reason: "invalid_model_for_provider",
        phase: "run",
        model: "claude-haiku-4-5",
      });

      await startTriage();

      expect(unavailable()?.reason).toBe("ProviderNotRunnableError");
      expect(errorMessage()).toBeUndefined();
    });
  });

  test("a throw that cannot even be stringified still gets a message", async () => {
    // Object.create(null) has no toString, so String() on it throws. The point
    // is that there is no input the client can turn into a second failure.
    syncAllError = Object.create(null);

    await startSync();

    expect(errorMessage()).toBe("unknown error");
  });
});
