import { describe, expect, test } from "bun:test";
import { iconButtonClass, iconButtonIconClass, iconButtonIconPx } from "./iconButton";

// What this guards is the unification itself, not the taste behind it: five
// toolbars used to spell this button five ways, and the only thing stopping a
// sixth spelling is that every one of them now comes from here.

describe("iconButtonClass", () => {
  // §3: "a control that could be `rounded-lg` or `rounded-full` should be
  // `rounded-full`". An icon button is square, so it is the control that rule
  // is about — and `rounded-lg` is what three of the five actually had.
  test("is a pill, never the square-ish radius it replaced", () => {
    expect(iconButtonClass()).toContain("rounded-full");
    expect(iconButtonClass()).not.toContain("rounded-lg");
    expect(iconButtonClass({ size: "md" })).toContain("rounded-full");
  });

  // §5: both sizes clear the 32px hit-area floor. The two exist for density,
  // not decoration, so neither may drop under it.
  test("offers two hit areas and both clear the 32px floor", () => {
    expect(iconButtonClass({ size: "sm" })).toContain("h-8 w-8");
    expect(iconButtonClass({ size: "md" })).toContain("h-9 w-9");
  });

  test("defaults to the dense size", () => {
    expect(iconButtonClass()).toBe(iconButtonClass({ size: "sm" }));
  });

  test("rests muted and presses in, whatever the variant", () => {
    for (const cls of [iconButtonClass(), iconButtonClass({ size: "md", danger: true })]) {
      expect(cls).toContain("text-gousse-muted");
      expect(cls).toContain("active:scale-[0.96]");
    }
  });

  // The destructive button reads as its siblings until the pointer is on it —
  // `danger` is a hover tint, so it must not touch the resting colour.
  test("tints danger on hover only", () => {
    const danger = iconButtonClass({ danger: true });
    expect(danger).toContain("hover:text-gousse-high");
    expect(danger).toContain("hover:bg-gousse-high/10");
    expect(danger).not.toContain("hover:text-gousse-ink");
    expect(danger.replace(/hover:\S+/g, "")).not.toContain("gousse-high");
  });

  test("disables without a pointer affordance and without a hover fill", () => {
    const cls = iconButtonClass();
    expect(cls).toContain("disabled:cursor-not-allowed");
    expect(cls).toContain("disabled:hover:bg-transparent");
  });

  // A transition over `all` animates layout properties too, which is what made
  // the old spellings feel different from each other on hover.
  test("transitions named properties rather than `all`", () => {
    expect(iconButtonClass()).toContain("transition-[background-color,color,transform]");
    expect(iconButtonClass()).not.toContain("transition-all");
  });
});

describe("icon sizing", () => {
  test("pairs a glyph with each button size", () => {
    expect(iconButtonIconClass("sm")).toBe("h-4 w-4");
    expect(iconButtonIconClass("md")).toBe("h-[18px] w-[18px]");
  });

  // The spinner that stands in for a running action takes a number, not a
  // class, and must match the glyph it replaces or the button resizes mid-press.
  test("gives the spinner the same size in px", () => {
    expect(iconButtonIconPx("sm")).toBe(14);
    expect(iconButtonIconPx("md")).toBe(16);
  });
});

// Tailwind v4 scans source text, so a class assembled from a variable at
// runtime compiles to no rule at all — the same trap `detailSurface` documents.
test("spells every class out as a literal for the scanner", async () => {
  const source = await Bun.file(new URL("./iconButton.ts", import.meta.url)).text();
  expect(source).not.toMatch(/["`](?:h-|w-|rounded-|text-|bg-|hover:)[\w[\]/-]*\$\{/);
});
