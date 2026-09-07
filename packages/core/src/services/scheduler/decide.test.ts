import { describe, expect, test } from "bun:test";

import { decideTick } from "./decide";

const state = (over: Partial<Parameters<typeof decideTick>[0]> = {}) => ({
  enabled: true,
  intervalMs: 15 * 60_000,
  now: 1_000_000,
  lastStartedAt: null,
  isRunning: false,
  ...over,
});

describe("decideTick", () => {
  test("skips when disabled", () => {
    expect(decideTick(state({ enabled: false }))).toEqual({
      action: "skip",
      reason: "disabled",
    });
  });

  test("skips when a run is in flight", () => {
    expect(decideTick(state({ isRunning: true }))).toEqual({
      action: "skip",
      reason: "in_flight",
    });
  });

  test("runs on first tick when never run before", () => {
    expect(decideTick(state({ lastStartedAt: null }))).toEqual({ action: "run" });
  });

  test("skips when interval has not elapsed", () => {
    expect(
      decideTick(
        state({
          intervalMs: 60_000,
          now: 500_000,
          lastStartedAt: 490_000,
        }),
      ),
    ).toEqual({ action: "skip", reason: "too_soon" });
  });

  test("runs when interval has elapsed exactly", () => {
    expect(decideTick(state({ intervalMs: 60_000, now: 500_000, lastStartedAt: 440_000 }))).toEqual(
      { action: "run" },
    );
  });

  test("runs when interval has been exceeded", () => {
    expect(decideTick(state({ intervalMs: 60_000, now: 500_000, lastStartedAt: 100_000 }))).toEqual(
      { action: "run" },
    );
  });

  test("disabled beats in_flight beats too_soon (priority order)", () => {
    // Disabled wins even if a run is somehow flagged in-flight.
    expect(decideTick(state({ enabled: false, isRunning: true }))).toEqual({
      action: "skip",
      reason: "disabled",
    });
    // in_flight wins over too_soon when both true.
    expect(
      decideTick(
        state({
          isRunning: true,
          intervalMs: 60_000,
          now: 500_000,
          lastStartedAt: 495_000,
        }),
      ),
    ).toEqual({ action: "skip", reason: "in_flight" });
  });
});
