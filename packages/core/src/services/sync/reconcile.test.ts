import { describe, expect, test } from "bun:test";

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
