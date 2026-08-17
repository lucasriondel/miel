import { describe, expect, test } from "bun:test";
import { APP_BASE_PATH, APP_BASE_URL, webAppUrl } from "./appBasePath";

describe("APP_BASE_PATH", () => {
  test("is the /app prefix, leading slash, no trailing slash", () => {
    expect(APP_BASE_PATH).toBe("/app");
  });

  test("APP_BASE_URL is the prefix with a trailing slash (Vite's `base`)", () => {
    expect(APP_BASE_URL).toBe("/app/");
  });
});

describe("webAppUrl", () => {
  // Any origin: this function is host-agnostic, and naming a real deployment's
  // host here would make the fixture read as one (see SITE_HOST, #99).
  test("puts an app page under the base path", () => {
    expect(webAppUrl("https://miel.example.org", "/settings")).toBe(
      "https://miel.example.org/app/settings",
    );
  });

  test("tolerates a trailing slash on the origin", () => {
    expect(webAppUrl("http://localhost:3000/", "/settings")).toBe(
      "http://localhost:3000/app/settings",
    );
  });

  test("tolerates a path with no leading slash", () => {
    expect(webAppUrl("http://localhost:3000", "settings")).toBe(
      "http://localhost:3000/app/settings",
    );
  });

  test("the app root is the base path itself", () => {
    expect(webAppUrl("http://localhost:3000", "/")).toBe("http://localhost:3000/app/");
  });
});
