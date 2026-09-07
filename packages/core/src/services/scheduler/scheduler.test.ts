import { afterEach, describe, expect, test } from "bun:test";

import { createScheduler } from "./scheduler";
import type { ScheduleSettings } from "../settings";
import { _resetSyncLockForTests } from "../syncLock";

afterEach(() => {
  _resetSyncLockForTests();
});

const settings = (over: Partial<ScheduleSettings> = {}): ScheduleSettings => ({
  enabled: true,
  intervalMinutes: 15,
  since: "24h",
  ...over,
});

describe("createScheduler", () => {
  test("triggerNow runs sync when enabled and interval elapsed", async () => {
    const calls: Array<{ since?: string }> = [];
    const scheduler = createScheduler({
      runSync: async (opts) => {
        calls.push(opts);
      },
      readSettings: async () => settings({ since: "48h" }),
      log: () => {},
      now: () => 1_000_000,
    });

    await scheduler.triggerNow();

    expect(calls).toEqual([{ since: "48h" }]);
    expect(scheduler.isRunning()).toBe(false);
    expect(scheduler.lastStartedAt()).toBe(1_000_000);
  });

  test("triggerNow does nothing when disabled", async () => {
    let called = 0;
    const scheduler = createScheduler({
      runSync: async () => {
        called += 1;
      },
      readSettings: async () => settings({ enabled: false }),
      log: () => {},
    });

    await scheduler.triggerNow();

    expect(called).toBe(0);
    expect(scheduler.lastStartedAt()).toBeNull();
  });

  test("triggerNow skips a second concurrent run", async () => {
    let callCount = 0;
    let inFlight = 0;
    let peak = 0;
    // Definite assignment rather than a throwaway no-op: the executor runs
    // synchronously, so `finish` is the resolver by the time anything reads it.
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const scheduler = createScheduler({
      runSync: async () => {
        callCount += 1;
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await gate;
        inFlight -= 1;
      },
      readSettings: async () => settings(),
      log: () => {},
    });

    const first = scheduler.triggerNow();
    // Let the first triggerNow reach its `await runSync` (which awaits `gate`).
    await new Promise<void>((r) => setTimeout(r, 0));
    // Second tick fires while first is still awaiting the gate.
    const second = scheduler.triggerNow();
    await new Promise<void>((r) => setTimeout(r, 0));
    finish();
    await Promise.all([first, second]);

    // The second triggerNow was rejected by the in-flight guard, so runSync
    // only ever fired once — and its inFlight count never went above 1.
    expect(callCount).toBe(1);
    expect(peak).toBe(1);
    expect(scheduler.isRunning()).toBe(false);
  });

  test("waits for the interval between runs", async () => {
    const calls: number[] = [];
    let currentNow = 1_000_000;
    const scheduler = createScheduler({
      runSync: async () => {
        calls.push(currentNow);
      },
      readSettings: async () => settings({ intervalMinutes: 15 }),
      log: () => {},
      now: () => currentNow,
    });

    await scheduler.triggerNow();
    // 5 minutes later — not enough.
    currentNow += 5 * 60_000;
    await scheduler.triggerNow();
    // 20 minutes total — enough.
    currentNow += 15 * 60_000;
    await scheduler.triggerNow();

    expect(calls).toEqual([1_000_000, 1_000_000 + 20 * 60_000]);
  });

  test("does not throw when readSettings fails", async () => {
    let ran = false;
    const scheduler = createScheduler({
      runSync: async () => {
        ran = true;
      },
      readSettings: async () => {
        throw new Error("db down");
      },
      log: () => {},
    });

    await scheduler.triggerNow();
    expect(ran).toBe(false);
  });

  test("does not throw when runSync fails and clears the running flag", async () => {
    const scheduler = createScheduler({
      runSync: async () => {
        throw new Error("sync exploded");
      },
      readSettings: async () => settings(),
      log: () => {},
    });

    await scheduler.triggerNow();
    expect(scheduler.isRunning()).toBe(false);
    // A follow-up trigger past the interval should not be blocked.
    expect(scheduler.lastFinishedAt()).not.toBeNull();
  });

  test("skips when the shared sync lock is already held (e.g. manual WS run)", async () => {
    let called = 0;
    let held = true;
    const scheduler = createScheduler({
      runSync: async () => {
        called += 1;
      },
      readSettings: async () => settings(),
      log: () => {},
      isSyncInFlight: () => held,
      tryAcquireSyncLock: () => {
        if (held) return false;
        held = true;
        return true;
      },
      releaseSyncLock: () => {
        held = false;
      },
    });

    await scheduler.triggerNow();
    expect(called).toBe(0);

    // Once the external run releases the lock, the next tick can proceed.
    held = false;
    await scheduler.triggerNow();
    expect(called).toBe(1);
  });

  test("start()/stop() install and clear a timer", () => {
    const timers: Array<{ cb: () => void; ms: number }> = [];
    let nextId = 1;
    const active = new Set<number>();
    const scheduler = createScheduler({
      runSync: async () => {},
      readSettings: async () => settings(),
      log: () => {},
      tickIntervalMs: 5_000,
      setInterval: (cb, ms) => {
        const id = nextId++;
        timers.push({ cb, ms });
        active.add(id);
        return id as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: (t) => {
        active.delete(t as unknown as number);
      },
    });

    scheduler.start();
    expect(timers.length).toBe(1);
    expect(timers[0].ms).toBe(5_000);
    expect(active.size).toBe(1);
    // Double-start is a no-op.
    scheduler.start();
    expect(timers.length).toBe(1);

    scheduler.stop();
    expect(active.size).toBe(0);
  });
});
