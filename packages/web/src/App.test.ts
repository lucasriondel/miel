import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #95. The layout owns the one scrolling element in the app — the wrapper the
// Outlet renders into — so it is the only place that can save and restore an
// offset across a route change. Source assertions: this package has no DOM
// harness, and what has to stay true is that the hook is pointed at the
// element that actually scrolls. The decisions inside it are covered in
// `hooks/useScrollRestoration.test.ts`.
const source = readFileSync(join(import.meta.dir, "App.tsx"), "utf8");

/** The opening tag of the element that owns the app's vertical scrolling. */
const scrollContainerTag = source.match(/<div[^>]*overflow-y-auto[^>]*>/)?.[0] ?? "";

describe("the layout's scroll restoration", () => {
  test("has exactly one scrolling element to restore", () => {
    expect(source.match(/overflow-y-auto/g)?.length).toBe(1);
  });

  test("hands that element to useScrollRestoration", () => {
    expect(source).toContain("useScrollRestoration");
    expect(scrollContainerTag).toMatch(/ref=\{scrollRef\}/);
    expect(source).toMatch(/useScrollRestoration\(scrollRef\)/);
  });
});
