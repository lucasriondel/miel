// The server step turns a failed request into an answer, so which failures it
// names — and which it leaves to keep the gate shut — is the whole of the rule.
import { describe, expect, test } from "bun:test";
import { ApiError } from "../../api/client";
import { classifyServerCheckError } from "./serverCheck";

describe("classifyServerCheckError", () => {
  test("a 401 is the build's secret being refused", () => {
    expect(classifyServerCheckError(new ApiError("unauthorized", 401, { error: "x" }))).toBe(
      "unauthorized",
    );
  });

  test("a failed fetch, or a proxy answering for a missing API, is unreachable", () => {
    expect(classifyServerCheckError(new TypeError("Failed to fetch"))).toBe("unreachable");
    for (const status of [502, 503, 504]) {
      expect(classifyServerCheckError(new ApiError("x", status, null))).toBe("unreachable");
    }
    expect(classifyServerCheckError(new ApiError("x", 500, ""))).toBe("unreachable");
  });

  test("the API's own 500 is not a reachability problem", () => {
    expect(classifyServerCheckError(new ApiError("boom", 500, { error: "internal_error" }))).toBe(
      null,
    );
  });

  test("a 404 means something behind the secret answered", () => {
    expect(classifyServerCheckError(new ApiError("not found", 404, null))).toBe("ok");
  });

  test("anything else is left unnamed, so the gate stays shut on it", () => {
    expect(classifyServerCheckError(new Error("unexpected"))).toBe(null);
  });
});
