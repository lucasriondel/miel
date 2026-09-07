import { describe, expect, test } from "bun:test";

import { resolveSyncRange } from "../../util/time";
import { reconcileDiff } from "./reconcile";

const row = (gmailMessageId: string, removedAt: Date | null = null) => ({
  gmailMessageId,
  removedAt,
});

describe("reconcileDiff", () => {
  test("marks DB rows missing from hits as removed", () => {
    const diff = reconcileDiff({
      existing: [row("a"), row("b"), row("c")],
      hits: new Set(["a", "c"]),
      capReached: false,
    });
    expect(diff.toRemove.toSorted()).toEqual(["b"]);
    expect(diff.toRestore).toEqual([]);
  });

  test("restores previously-removed messages that reappear in hits", () => {
    const t = new Date("2025-01-01T00:00:00Z");
    const diff = reconcileDiff({
      existing: [row("a", t), row("b", t), row("c")],
      hits: new Set(["a", "c"]),
      capReached: false,
    });
    // `a` is in hits and was removed → restore.
    // `b` is missing from hits but already marked removed → no change.
    // `c` is in hits and not removed → no change.
    expect(diff.toRestore).toEqual(["a"]);
    expect(diff.toRemove).toEqual([]);
  });

  test("removes everything when hits is empty", () => {
    const diff = reconcileDiff({
      existing: [row("a"), row("b")],
      hits: new Set(),
      capReached: false,
    });
    expect(diff.toRemove.toSorted()).toEqual(["a", "b"]);
    expect(diff.toRestore).toEqual([]);
  });

  test("skips removal when the search cap was reached but still restores", () => {
    const t = new Date("2025-01-01T00:00:00Z");
    const diff = reconcileDiff({
      existing: [row("a", t), row("b"), row("c")],
      hits: new Set(["a"]),
      capReached: true,
    });
    // Don't trust that `b` and `c` are really gone — we hit the search cap.
    // But `a` being present is positive evidence, so restore is safe.
    expect(diff.toRemove).toEqual([]);
    expect(diff.toRestore).toEqual(["a"]);
  });

  test("does nothing when DB has no rows in the window", () => {
    const diff = reconcileDiff({
      existing: [],
      hits: new Set(["a", "b"]),
      capReached: false,
    });
    expect(diff.toRemove).toEqual([]);
    expect(diff.toRestore).toEqual([]);
  });
});

/**
 * `reconcileDiff` is only ever as right as the window it is asked about: it
 * reads "not in hits" as "gone from Gmail", which holds only for the span the
 * search actually covered. A range sync's query is written in calendar dates
 * and `before:` excludes its own date, so the requested `to` ran a whole day
 * past the results and every message from that day was soft-removed (#150).
 */
// A period sync (or the focus sync) ending partway through the current day.
const range = { from: "2026-08-31T22:00:00.000Z", to: "2026-09-02T14:41:00.000Z" };
const inWindow = (d: Date, r: { from: Date; to: Date }) => d >= r.from && d < r.to;

describe("the reconcile window matches the searched window", () => {
  test("a message from the unsearched last day is never offered to the diff", () => {
    const resolved = resolveSyncRange({ range });
    const sentToday = new Date("2026-09-02T09:00:00.000Z");

    // Gmail was not asked about Sept 2, so its silence is not evidence...
    expect(resolved.query).toContain("before:2026/09/02");
    // ...and the row therefore stays out of `existing` entirely.
    expect(inWindow(sentToday, resolved)).toBe(false);

    // Which is what keeps it: were it in scope, an empty hit set removes it.
    const diff = reconcileDiff({
      existing: [row("today-msg")],
      hits: new Set<string>(),
      capReached: false,
    });
    expect(diff.toRemove).toEqual(["today-msg"]);
  });

  test("messages from the searched days stay in scope", () => {
    const resolved = resolveSyncRange({ range });
    // Sept 1 is covered by `after:2026/08/31 before:2026/09/02`, so a real
    // deletion there must still be reconciled.
    expect(inWindow(new Date("2026-09-01T12:00:00.000Z"), resolved)).toBe(true);
  });

  test("a message landing exactly on the boundary is outside it", () => {
    const resolved = resolveSyncRange({ range });
    // The bound is where the search stopped, not the last instant it covered.
    expect(inWindow(new Date("2026-09-02T00:00:00.000Z"), resolved)).toBe(false);
  });
});
