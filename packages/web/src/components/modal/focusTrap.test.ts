import { describe, expect, test } from "bun:test";
import { nextTrapFocusIndex } from "./focusTrap";

describe("nextTrapFocusIndex", () => {
  test("has nowhere to send focus when the dialog holds no focusables", () => {
    expect(nextTrapFocusIndex(0, -1, false)).toBeNull();
  });

  test("steps forward through the focusables", () => {
    expect(nextTrapFocusIndex(3, 0, false)).toBe(1);
    expect(nextTrapFocusIndex(3, 1, false)).toBe(2);
  });

  test("wraps from the last focusable back to the first", () => {
    expect(nextTrapFocusIndex(3, 2, false)).toBe(0);
  });

  test("steps backward with shift", () => {
    expect(nextTrapFocusIndex(3, 2, true)).toBe(1);
  });

  test("wraps from the first focusable back to the last with shift", () => {
    expect(nextTrapFocusIndex(3, 0, true)).toBe(2);
  });

  test("pulls focus in from outside the dialog to the first focusable", () => {
    expect(nextTrapFocusIndex(3, -1, false)).toBe(0);
  });

  test("pulls focus in from outside the dialog to the last focusable with shift", () => {
    expect(nextTrapFocusIndex(3, -1, true)).toBe(2);
  });

  test("keeps a lone focusable focused in both directions", () => {
    expect(nextTrapFocusIndex(1, 0, false)).toBe(0);
    expect(nextTrapFocusIndex(1, 0, true)).toBe(0);
  });
});
