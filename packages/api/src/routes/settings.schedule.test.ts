import { describe, expect, test } from "bun:test";
import { getEnv, registerScheduler, type Scheduler } from "@miel/core";
import { createApp } from "../app";

// A stand-in scheduler handle so the status route has deterministic timings to
// surface, without booting the real setInterval loop.
const fakeScheduler = (over: Partial<Scheduler> = {}): Scheduler => ({
  start: () => {},
  stop: () => {},
  triggerNow: async () => {},
  isRunning: () => false,
  lastStartedAt: () => null,
  lastFinishedAt: () => null,
  ...over,
});

function authGet(app: ReturnType<typeof createApp>, path: string) {
  const { API_SECRET } = getEnv();
  return app.fetch(
    new Request(`http://localhost${path}`, {
      headers: { Authorization: `Bearer ${API_SECRET}` },
    }),
  );
}

describe("GET /settings/schedule/status", () => {
  test("returns the registered scheduler's fields + settings enabled", async () => {
    registerScheduler(
      fakeScheduler({
        isRunning: () => true,
        lastStartedAt: () => 111,
        lastFinishedAt: () => 222,
      }),
    );
    const app = createApp();

    const res = await authGet(app, "/settings/schedule/status");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    // `enabled` is read from settings (migrated default = false); timings come
    // from the registered handle.
    expect(body).toEqual({
      enabled: false,
      isRunning: true,
      lastStartedAt: 111,
      lastFinishedAt: 222,
    });
  });

  test("requires bearer auth", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/settings/schedule/status"));
    expect(res.status).toBe(401);
  });
});
