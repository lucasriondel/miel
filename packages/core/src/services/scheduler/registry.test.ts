import { afterEach, describe, expect, test } from "bun:test";

import { _resetSchedulerRegistryForTests, getScheduleStatus, registerScheduler } from "./registry";
import type { Scheduler } from "./scheduler";

afterEach(() => {
  _resetSchedulerRegistryForTests();
});

// A stand-in scheduler handle. Only the status accessors are exercised here.
const fakeScheduler = (over: Partial<Scheduler> = {}): Scheduler => ({
  start: () => {},
  stop: () => {},
  triggerNow: async () => {},
  isRunning: () => false,
  lastStartedAt: () => null,
  lastFinishedAt: () => null,
  ...over,
});

describe("getScheduleStatus", () => {
  test("surfaces the injected scheduler's last-run timings + settings enabled", async () => {
    const status = await getScheduleStatus({
      readSettings: async () => ({ enabled: true }),
      scheduler: fakeScheduler({
        isRunning: () => true,
        lastStartedAt: () => 1_000,
        lastFinishedAt: () => 2_000,
      }),
    });

    expect(status).toEqual({
      enabled: true,
      isRunning: true,
      lastStartedAt: 1_000,
      lastFinishedAt: 2_000,
    });
  });

  test("degrades to null timings / not-running when no scheduler is registered", async () => {
    const status = await getScheduleStatus({
      readSettings: async () => ({ enabled: false }),
      scheduler: null,
    });

    expect(status).toEqual({
      enabled: false,
      isRunning: false,
      lastStartedAt: null,
      lastFinishedAt: null,
    });
  });

  test("reads back the handle published via registerScheduler", async () => {
    registerScheduler(
      fakeScheduler({
        isRunning: () => false,
        lastStartedAt: () => 42,
        lastFinishedAt: () => 99,
      }),
    );

    const status = await getScheduleStatus({
      readSettings: async () => ({ enabled: true }),
    });

    expect(status.lastStartedAt).toBe(42);
    expect(status.lastFinishedAt).toBe(99);
    expect(status.enabled).toBe(true);
  });
});
