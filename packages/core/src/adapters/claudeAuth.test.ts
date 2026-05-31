// Unit tests for the Claude "not logged in" detector. Pure function, no process
// spawn or DB needed. Run: bun test src/adapters/claudeAuth.test.ts
import { expect, test, describe } from "bun:test";
import { isClaudeNotLoggedInResult } from "./claudeAuth";

// The exact stdout the `claude -p` CLI emits when it has no auth (from a real
// API log): a success-shaped envelope with is_error:true and this result.
const REAL_ENVELOPE = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: true,
  result: "Not logged in · Please run /login",
  session_id: "bae84966-7b6f-40b2-8647-f8d5562b4bbf",
  total_cost_usd: 0,
});

describe("isClaudeNotLoggedInResult", () => {
  test("matches the real CLI envelope on stdout", () => {
    expect(isClaudeNotLoggedInResult(REAL_ENVELOPE)).toBe(true);
  });

  test("matches the bare result string", () => {
    expect(isClaudeNotLoggedInResult("Not logged in · Please run /login")).toBe(
      true,
    );
  });

  test("is case-insensitive", () => {
    expect(isClaudeNotLoggedInResult("not logged in")).toBe(true);
  });

  test("matches on the /login hint alone", () => {
    expect(isClaudeNotLoggedInResult("please run /login to continue")).toBe(
      true,
    );
  });

  test("does not match a normal triage/run error", () => {
    expect(
      isClaudeNotLoggedInResult("claude reported error: rate limited"),
    ).toBe(false);
  });

  test("does not match a successful result payload", () => {
    expect(
      isClaudeNotLoggedInResult('{"results":[{"id":"1","priority":"high"}]}'),
    ).toBe(false);
  });

  test("does not match empty output", () => {
    expect(isClaudeNotLoggedInResult("")).toBe(false);
  });
});
