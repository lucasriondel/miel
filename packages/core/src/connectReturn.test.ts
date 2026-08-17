import { describe, test, expect } from "bun:test";
import {
  CONNECT_RETURN_TARGETS,
  DEFAULT_CONNECT_RETURN_TARGET,
  connectReturnPath,
  connectReturnUrl,
  parseConnectReturnTarget,
} from "./connectReturn";

const ORIGIN = "https://miel.example.com";

describe("parseConnectReturnTarget", () => {
  test("accepts every known target", () => {
    for (const target of CONNECT_RETURN_TARGETS) {
      expect(parseConnectReturnTarget(target)).toBe(target);
    }
  });

  test("falls back to the default for a missing value", () => {
    expect(parseConnectReturnTarget(undefined)).toBe(DEFAULT_CONNECT_RETURN_TARGET);
    expect(parseConnectReturnTarget(null)).toBe(DEFAULT_CONNECT_RETURN_TARGET);
  });

  test("falls back to the default for anything outside the set", () => {
    expect(parseConnectReturnTarget("https://evil.example.com")).toBe(
      DEFAULT_CONNECT_RETURN_TARGET,
    );
    expect(parseConnectReturnTarget("//evil.example.com")).toBe(DEFAULT_CONNECT_RETURN_TARGET);
    expect(parseConnectReturnTarget("/logs")).toBe(DEFAULT_CONNECT_RETURN_TARGET);
    expect(parseConnectReturnTarget(42)).toBe(DEFAULT_CONNECT_RETURN_TARGET);
  });
});

describe("connectReturnPath", () => {
  test("settings lands on the settings page", () => {
    expect(connectReturnPath("settings")).toBe("/settings");
    expect(connectReturnPath("settings", "acct-1")).toBe("/settings");
  });

  test("inbox lands on the connected account's inbox", () => {
    expect(connectReturnPath("inbox", "acct-1")).toBe("/account/acct-1");
  });

  test("inbox without an account falls back to the app root", () => {
    expect(connectReturnPath("inbox")).toBe("/");
    expect(connectReturnPath("inbox", null)).toBe("/");
  });

  test("escapes an account id that is not path-safe", () => {
    expect(connectReturnPath("inbox", "a/b?c")).toBe("/account/a%2Fb%3Fc");
  });
});

describe("connectReturnUrl", () => {
  test("carries the app base path, so a reload of the landing URL resolves", () => {
    expect(connectReturnUrl(ORIGIN, { target: "settings", connected: "a@b.co" })).toBe(
      `${ORIGIN}/app/settings?connected=a%40b.co`,
    );
  });

  test("sends a connect started from the gate to the new account's inbox", () => {
    expect(
      connectReturnUrl(ORIGIN, {
        target: "inbox",
        accountId: "acct-1",
        connected: "a@b.co",
      }),
    ).toBe(`${ORIGIN}/app/account/acct-1?connected=a%40b.co`);
  });

  test("reports a failure on the page the flow started from", () => {
    expect(connectReturnUrl(ORIGIN, { target: "inbox", error: "state" })).toBe(
      `${ORIGIN}/app/?connect_error=state`,
    );
    expect(connectReturnUrl(ORIGIN, { target: "settings", error: "access_denied" })).toBe(
      `${ORIGIN}/app/settings?connect_error=access_denied`,
    );
  });

  test("prefers the success param when both are somehow present", () => {
    expect(
      connectReturnUrl(ORIGIN, {
        target: "settings",
        connected: "a@b.co",
        error: "state",
      }),
    ).toBe(`${ORIGIN}/app/settings?connected=a%40b.co`);
  });

  test("emits no query string when there is nothing to report", () => {
    expect(connectReturnUrl(ORIGIN, { target: "settings" })).toBe(`${ORIGIN}/app/settings`);
  });

  test("tolerates a trailing slash on the origin", () => {
    expect(connectReturnUrl(`${ORIGIN}/`, { target: "settings" })).toBe(`${ORIGIN}/app/settings`);
  });
});
