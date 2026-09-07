import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { cn } from "./utils";

describe("cn", () => {
  test("joins class names and drops falsy ones", () => {
    // Typed rather than literal `false`: the point is the `flag && "class"` shape
    // every call site uses, and a literal reads as a constant to be folded away.
    const hidden: boolean = false;
    expect(cn("px-4", hidden && "hidden", undefined, "py-2")).toBe("px-4 py-2");
  });

  test("lets a later Tailwind utility win over the one it conflicts with", () => {
    expect(cn("px-4", "px-6")).toBe("px-6");
  });
});

describe("the shim", () => {
  // The npm package is deprecated: gousse-ui ships as a shadcn registry now and
  // 0.4.x will never get another fix. Every `cn` in the app resolves through
  // this file, so its target is the whole migration for this helper.
  test("re-exports the vendored copy, not the npm package", async () => {
    const source = await Bun.file(resolve(import.meta.dir, "utils.ts")).text();
    expect(source).not.toContain("@lucasriondel/gousse-ui");
    expect(source).toContain("./gousse/utils");
  });
});
