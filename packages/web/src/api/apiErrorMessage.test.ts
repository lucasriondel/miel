import { describe, expect, test } from "bun:test";
import { ApiError } from "./client";
import { apiErrorMessage } from "./apiErrorMessage";

describe("apiErrorMessage", () => {
  test("prefers the body's human message over the error code", () => {
    // `apiFetch` names an ApiError after the envelope's `error` field, which is
    // a machine code ("filter_merge_failed"). The routes send the sentence the
    // user actually needs in `message`.
    const err = new ApiError("filter_merge_failed", 400, {
      error: "filter_merge_failed",
      message: "These filters disagree about L1: one adds it, another removes it.",
      reason: "unmergeable",
    });

    expect(apiErrorMessage(err)).toBe(
      "These filters disagree about L1: one adds it, another removes it.",
    );
  });

  test("falls back to the code when the body carries no message", () => {
    const err = new ApiError("gmail_error", 502, { error: "gmail_error" });
    expect(apiErrorMessage(err)).toBe("gmail_error");
  });

  test("ignores a non-string message rather than rendering an object", () => {
    const err = new ApiError("validation_failed", 400, {
      error: "validation_failed",
      message: { nested: true },
    });
    expect(apiErrorMessage(err)).toBe("validation_failed");
  });

  // #125. The API says *what* happened in codes and leaves the sentence to the
  // edges, so that the same failure can read one way in a toast and another in
  // the composer. This describer is one of those edges: "claude_unavailable" is
  // not something to show a user.
  describe("the codes that arrive without a sentence", () => {
    test("turns an unrunnable provider into copy that says what to do", () => {
      const err = new ApiError("claude_unavailable", 503, {
        error: "claude_unavailable",
        reason: "missing_provider_credential",
        task: "reply",
        provider: "openai",
      });

      const message = apiErrorMessage(err);

      expect(message).not.toBe("claude_unavailable");
      expect(message).toMatch(/Settings/);
    });

    test("says the model is the problem when that is the reason", () => {
      const err = new ApiError("claude_unavailable", 503, {
        error: "claude_unavailable",
        reason: "invalid_model_for_provider",
        task: "triage",
        provider: "google",
        model: "gpt-4.1",
      });

      expect(apiErrorMessage(err)).toMatch(/model/i);
    });

    test("still has something to say with no reason at all — a missing token", () => {
      // `ClaudeTokenMissingError` maps to the same code and carries no reason.
      const err = new ApiError("claude_unavailable", 503, { error: "claude_unavailable" });

      expect(apiErrorMessage(err)).toMatch(/Settings/);
    });

    test("a sentence the API did send still wins", () => {
      const err = new ApiError("claude_unavailable", 503, {
        error: "claude_unavailable",
        message: "The Claude Code CLI reported its token is expired.",
      });

      expect(apiErrorMessage(err)).toBe("The Claude Code CLI reported its token is expired.");
    });
  });

  test("handles a plain Error and anything else", () => {
    expect(apiErrorMessage(new Error("boom"))).toBe("boom");
    expect(apiErrorMessage("nope")).toBe("Unknown error");
    expect(apiErrorMessage(null)).toBe("Unknown error");
  });
});
