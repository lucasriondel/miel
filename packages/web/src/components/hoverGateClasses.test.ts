// The predicate the three visibility suites lean on. It is the difference
// between "no hover gate" (which #144 needed and which would now forbid the
// pointer refinement too) and "no hover gate a touch device is subject to".
import { describe, expect, test } from "bun:test";
import { unconditionalHidingClasses } from "./hoverGateClasses";

/**
 * A hiding class assembled from its variants rather than written out whole.
 *
 * Tailwind's scanner reads source *text*, so a class name spelled literally in
 * a test file mints that utility into the production bundle. The names below
 * exist to be parsed by the function under test, not to style anything.
 */
const gate = (...variants: string[]) => [...variants, "opacity-0"].join(":");

describe("unconditionalHidingClasses", () => {
  test("passes classes that hide nothing", () => {
    expect(unconditionalHidingClasses(["flex", "shrink-0", "opacity-100"])).toEqual([]);
  });

  test("catches the bug #144 fixed — a bare hiding class", () => {
    expect(unconditionalHidingClasses(["opacity-0"])).toEqual(["opacity-0"]);
    expect(unconditionalHidingClasses(["hidden", "flex"])).toEqual(["hidden"]);
    expect(unconditionalHidingClasses(["invisible"])).toEqual(["invisible"]);
  });

  test("catches a gate behind a variant that still reaches a touch device", () => {
    // The exact shape the band headings used to have: hover-gated above `sm`,
    // which a tablet satisfies.
    expect(unconditionalHidingClasses(["sm:opacity-0"])).toEqual(["sm:opacity-0"]);
    expect(unconditionalHidingClasses(["group-hover:opacity-0"])).toEqual([
      "group-hover:opacity-0",
    ]);
  });

  test("allows a gate behind `pointer-fine:`, wherever in the chain it sits", () => {
    expect(unconditionalHidingClasses([gate("pointer-fine")])).toEqual([]);
    expect(unconditionalHidingClasses([gate("sm", "pointer-fine")])).toEqual([]);
    expect(unconditionalHidingClasses([gate("pointer-fine", "group-hover/category")])).toEqual([]);
  });

  test("does not mistake a lookalike prefix for the variant", () => {
    expect(unconditionalHidingClasses(["pointer-fine-ish:opacity-0"])).toEqual([
      "pointer-fine-ish:opacity-0",
    ]);
    // `pointer-events-none` is not a hiding utility and never was.
    expect(unconditionalHidingClasses(["pointer-events-none"])).toEqual([]);
  });

  test("reads the opacity modifier syntax as the utility it is", () => {
    expect(unconditionalHidingClasses(["opacity-0/50"])).toEqual(["opacity-0/50"]);
    // …but not an unrelated utility that merely starts with the same letters.
    expect(unconditionalHidingClasses(["opacity-05"])).toEqual([]);
  });
});
