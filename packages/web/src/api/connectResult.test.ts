import { describe, expect, test } from "bun:test";
import { readConnectResult, stripConnectResult } from "./connectResult";

describe("readConnectResult", () => {
  test("reads the connected account off a successful return", () => {
    expect(readConnectResult(new URLSearchParams("connected=a%40b.co"))).toEqual({
      kind: "connected",
      email: "a@b.co",
    });
  });

  test("reads the reason off a failed return", () => {
    expect(readConnectResult(new URLSearchParams("connect_error=access_denied"))).toEqual({
      kind: "error",
      reason: "access_denied",
    });
  });

  test("is null on a page that is not a connect landing", () => {
    expect(readConnectResult(new URLSearchParams(""))).toBeNull();
    expect(readConnectResult(new URLSearchParams("label=INBOX"))).toBeNull();
  });

  test("ignores empty params rather than toasting an empty message", () => {
    expect(readConnectResult(new URLSearchParams("connected="))).toBeNull();
    expect(readConnectResult(new URLSearchParams("connect_error="))).toBeNull();
  });

  test("prefers success when both are present", () => {
    expect(
      readConnectResult(new URLSearchParams("connected=a%40b.co&connect_error=state")),
    ).toEqual({ kind: "connected", email: "a@b.co" });
  });
});

describe("stripConnectResult", () => {
  test("drops both params so a refresh does not re-toast", () => {
    const next = stripConnectResult(new URLSearchParams("connected=a%40b.co&connect_error=state"));

    expect(next.toString()).toBe("");
  });

  test("keeps every other param intact", () => {
    const next = stripConnectResult(new URLSearchParams("label=INBOX&connected=a%40b.co"));

    expect(next.get("label")).toBe("INBOX");
    expect(next.has("connected")).toBe(false);
  });

  test("returns a copy, leaving the caller's params untouched", () => {
    const params = new URLSearchParams("connected=a%40b.co");

    stripConnectResult(params);

    expect(params.get("connected")).toBe("a@b.co");
  });
});
