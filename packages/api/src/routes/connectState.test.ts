import { describe, expect, test } from "bun:test";
import { createConnectStateStore } from "./connectState";

const T0 = 1_700_000_000_000;

describe("createConnectStateStore", () => {
  test("hands back the target the flow was started with", () => {
    const store = createConnectStateStore({ ttlMs: 1000 });
    const state = store.issue("inbox", T0);

    expect(store.consume(state, T0 + 1)).toEqual({ target: "inbox" });
  });

  test("issues an unguessable, distinct state per flow", () => {
    const store = createConnectStateStore({ ttlMs: 1000 });
    const a = store.issue("settings", T0);
    const b = store.issue("settings", T0);

    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  test("is single-use: a replayed state no longer resolves", () => {
    const store = createConnectStateStore({ ttlMs: 1000 });
    const state = store.issue("inbox", T0);

    expect(store.consume(state, T0)).toEqual({ target: "inbox" });
    expect(store.consume(state, T0)).toBeNull();
  });

  test("rejects an unknown or absent state", () => {
    const store = createConnectStateStore({ ttlMs: 1000 });

    expect(store.consume("forged", T0)).toBeNull();
    expect(store.consume(undefined, T0)).toBeNull();
  });

  test("rejects a state past its TTL, and drops it", () => {
    const store = createConnectStateStore({ ttlMs: 1000 });
    const state = store.issue("inbox", T0);

    expect(store.consume(state, T0 + 1001)).toBeNull();
    expect(store.consume(state, T0)).toBeNull();
  });

  test("keeps separate flows apart", () => {
    const store = createConnectStateStore({ ttlMs: 1000 });
    const fromSettings = store.issue("settings", T0);
    const fromGate = store.issue("inbox", T0);

    expect(store.consume(fromGate, T0)).toEqual({ target: "inbox" });
    expect(store.consume(fromSettings, T0)).toEqual({ target: "settings" });
  });
});
