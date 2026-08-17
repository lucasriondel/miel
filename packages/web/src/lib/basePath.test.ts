import { describe, expect, test } from "bun:test";
import { appBasename, assetUrl, basenameFor, joinBase } from "./basePath";

describe("basenameFor", () => {
  test("strips the trailing slash Vite puts on BASE_URL", () => {
    expect(basenameFor("/app/")).toBe("/app");
  });

  test("keeps the root base as '/' rather than an empty basename", () => {
    expect(basenameFor("/")).toBe("/");
  });

  test("handles a base with no trailing slash", () => {
    expect(basenameFor("/app")).toBe("/app");
  });
});

describe("joinBase", () => {
  test("prefixes a public asset path with the base", () => {
    expect(joinBase("/app/", "/miel.webp")).toBe("/app/miel.webp");
  });

  test("does not double the slash when the path has none", () => {
    expect(joinBase("/app/", "miel.webp")).toBe("/app/miel.webp");
  });

  test("leaves paths untouched at the root base", () => {
    expect(joinBase("/", "/miel.webp")).toBe("/miel.webp");
  });
});

// Outside a Vite build there is no BASE_URL, and both of these read it at
// import time — they must degrade to the root base rather than throw.
describe("without a Vite-injected BASE_URL", () => {
  test("the basename is the root", () => {
    expect(appBasename).toBe("/");
  });

  test("asset URLs are left at the root", () => {
    expect(assetUrl("/miel.webp")).toBe("/miel.webp");
  });
});
