/**
 * WS sync streaming smoke test.
 *
 * 1. Auth check: connect with a bad token, expect 401.
 * 2. Auth check: connect with the right token, expect upgrade.
 * 3. Bad payload check: send a non-sync.start message, expect sync.error then close.
 *
 * Real sync.start runs are deferred — they require live gog + claude. The
 * auth + protocol checks here are enough to confirm the upgrade plumbing
 * + message routing.
 */
import { setTimeout as sleep } from "node:timers/promises";

const API_SECRET = process.env.API_SECRET ?? "change-me-to-a-random-string";
const PORT = Number(process.env.API_PORT ?? 3001);
const WS_URL = `ws://localhost:${PORT}/sync/ws`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function expectUnauthorized() {
  const ws = new WebSocket(`${WS_URL}?token=wrong`);
  const result = await new Promise<"opened" | "closed">((resolve) => {
    ws.addEventListener("open", () => resolve("opened"));
    ws.addEventListener("close", () => resolve("closed"));
    ws.addEventListener("error", () => resolve("closed"));
  });
  assert(result === "closed", `expected closed for bad token, got ${result}`);
  console.log("[ok] bad token rejected (no upgrade)");
}

interface CollectResult {
  events: unknown[];
  closed: boolean;
  closeCode: number | null;
}

async function connectAndSend(message: unknown, timeoutMs = 1500): Promise<CollectResult> {
  const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(API_SECRET)}`);
  const events: unknown[] = [];
  let closeCode: number | null = null;

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("open timeout")), timeoutMs);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error("ws error before open"));
    });
  });

  ws.addEventListener("message", (ev: MessageEvent) => {
    const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
    try {
      events.push(JSON.parse(raw));
    } catch {
      events.push(raw);
    }
  });

  const closedPromise = new Promise<void>((resolve) => {
    ws.addEventListener("close", (ev: CloseEvent) => {
      closeCode = ev.code;
      resolve();
    });
  });

  ws.send(typeof message === "string" ? message : JSON.stringify(message));

  await Promise.race([closedPromise, sleep(timeoutMs)]);
  if (ws.readyState !== WebSocket.CLOSED) ws.close();
  await closedPromise.catch(() => {});

  return { events, closed: closeCode !== null, closeCode };
}

async function expectErrorOnInvalidJson() {
  const { events } = await connectAndSend("this is not json");
  const errorEvents = events.filter((e) => (e as { type?: string }).type === "sync.error");
  assert(errorEvents.length >= 1, `expected sync.error, got: ${JSON.stringify(events)}`);
  console.log(
    `[ok] invalid JSON -> sync.error (${(errorEvents[0] as { message: string }).message})`,
  );
}

async function expectErrorOnBadPayload() {
  const { events } = await connectAndSend({ type: "not.a.real.event" });
  const errorEvents = events.filter((e) => (e as { type?: string }).type === "sync.error");
  assert(errorEvents.length >= 1, `expected sync.error, got: ${JSON.stringify(events)}`);
  console.log(
    `[ok] bad payload -> sync.error (${(errorEvents[0] as { message: string }).message})`,
  );
}

async function expectSyncStartedThenError() {
  // Bogus account triggers a sync.started + an error from syncAll (account not found),
  // which the handler reports as a sync.error. Confirms the full message path.
  const { events } = await connectAndSend(
    { type: "sync.start", account: "no-such-account@example.com", since: "1d" },
    5000,
  );
  const types = events.map((e) => (e as { type?: string }).type);
  assert(types.includes("sync.started"), `expected sync.started, got: ${JSON.stringify(types)}`);
  assert(
    types.includes("sync.error") || types.includes("sync.finished"),
    `expected sync.error or sync.finished, got: ${JSON.stringify(types)}`,
  );
  console.log(`[ok] sync.start happy-path emits: ${types.join(", ")}`);
}

async function main() {
  await expectUnauthorized();
  await expectErrorOnInvalidJson();
  await expectErrorOnBadPayload();
  await expectSyncStartedThenError();
  console.log("\nAll WS protocol smoke checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
