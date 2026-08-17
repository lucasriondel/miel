import { describe, test, expect } from "bun:test";
import {
  selectionKey,
  toggleSelection,
  selectMany,
  selectionForAccount,
  exitedSelection,
  type SelectionState,
} from "./useSelection";

const empty: SelectionState = {
  selectMode: false,
  selectedIds: new Set<string>(),
};

describe("selectionKey", () => {
  test("joins accountId + gmailMessageId with a separator", () => {
    expect(selectionKey("acct-1", "msg-1")).toBe("acct-1|msg-1");
  });
});

describe("toggleSelection", () => {
  test("adds the id if absent", () => {
    const next = toggleSelection(empty, "a1", "m1");
    expect(next.selectedIds.has("a1|m1")).toBe(true);
  });

  test("removes the id if already present", () => {
    const seeded: SelectionState = {
      selectMode: true,
      selectedIds: new Set(["a1|m1"]),
    };
    const next = toggleSelection(seeded, "a1", "m1");
    expect(next.selectedIds.has("a1|m1")).toBe(false);
  });
});

describe("selectMany", () => {
  test("adds every id under the given account, leaving others intact", () => {
    const seeded: SelectionState = {
      selectMode: true,
      selectedIds: new Set(["a2|other"]),
    };
    const next = selectMany(seeded, "a1", ["m1", "m2"]);
    expect(next.selectedIds.has("a1|m1")).toBe(true);
    expect(next.selectedIds.has("a1|m2")).toBe(true);
    expect(next.selectedIds.has("a2|other")).toBe(true);
  });
});

describe("exitedSelection", () => {
  test("leaving select mode drops the selection with it", () => {
    const seeded: SelectionState = {
      selectMode: true,
      selectedIds: new Set(["a1|m1", "a2|m2"]),
    };
    const next = exitedSelection(seeded);
    expect(next.selectMode).toBe(false);
    expect(next.selectedIds.size).toBe(0);
  });
});

describe("selectionForAccount", () => {
  test("returns only ids whose account matches", () => {
    const seeded: SelectionState = {
      selectMode: true,
      selectedIds: new Set(["a1|m1", "a1|m2", "a2|x1"]),
    };
    expect(selectionForAccount(seeded, "a1").toSorted()).toEqual(["m1", "m2"]);
    expect(selectionForAccount(seeded, "a2")).toEqual(["x1"]);
    expect(selectionForAccount(seeded, "a3")).toEqual([]);
  });
});
