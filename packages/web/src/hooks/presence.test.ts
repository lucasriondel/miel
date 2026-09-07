import { describe, expect, test } from "bun:test";
import { mergePresence, type Presence } from "./presence";

const id = (x: { id: string }) => x.id;

describe("mergePresence", () => {
  test("marks all items as present on first render", () => {
    const next = [{ id: "a" }, { id: "b" }];
    expect(mergePresence([], next, id)).toEqual([
      { item: { id: "a" }, key: "a", state: "present" },
      { item: { id: "b" }, key: "b", state: "present" },
    ]);
  });

  test("appends new items as present, keeps existing ones present", () => {
    const rendered: Presence<{ id: string }>[] = [
      { item: { id: "a" }, key: "a", state: "present" },
    ];
    const next = [{ id: "a" }, { id: "b" }];
    expect(mergePresence(rendered, next, id)).toEqual([
      { item: { id: "a" }, key: "a", state: "present" },
      { item: { id: "b" }, key: "b", state: "present" },
    ]);
  });

  test("marks removed items as leaving in their previous position", () => {
    const rendered: Presence<{ id: string }>[] = [
      { item: { id: "a" }, key: "a", state: "present" },
      { item: { id: "b" }, key: "b", state: "present" },
      { item: { id: "c" }, key: "c", state: "present" },
    ];
    const next = [{ id: "a" }, { id: "c" }];
    expect(mergePresence(rendered, next, id)).toEqual([
      { item: { id: "a" }, key: "a", state: "present" },
      { item: { id: "b" }, key: "b", state: "leaving" },
      { item: { id: "c" }, key: "c", state: "present" },
    ]);
  });

  test("keeps already-leaving items as leaving", () => {
    const rendered: Presence<{ id: string }>[] = [
      { item: { id: "a" }, key: "a", state: "present" },
      { item: { id: "b" }, key: "b", state: "leaving" },
    ];
    const next = [{ id: "a" }];
    const out = mergePresence(rendered, next, id);
    expect(out).toEqual([
      { item: { id: "a" }, key: "a", state: "present" },
      { item: { id: "b" }, key: "b", state: "leaving" },
    ]);
  });

  test("re-promotes a leaving item to present if it comes back", () => {
    const rendered: Presence<{ id: string }>[] = [
      { item: { id: "a" }, key: "a", state: "present" },
      { item: { id: "b" }, key: "b", state: "leaving" },
    ];
    const next = [{ id: "a" }, { id: "b" }];
    expect(mergePresence(rendered, next, id)).toEqual([
      { item: { id: "a" }, key: "a", state: "present" },
      { item: { id: "b" }, key: "b", state: "present" },
    ]);
  });

  test("refreshes the item reference for still-present keys", () => {
    const a1 = { id: "a", n: 1 };
    const a2 = { id: "a", n: 2 };
    const rendered: Presence<{ id: string; n: number }>[] = [
      { item: a1, key: "a", state: "present" },
    ];
    const out = mergePresence(rendered, [a2], (x) => x.id);
    expect(out[0]?.item).toBe(a2);
  });
});
