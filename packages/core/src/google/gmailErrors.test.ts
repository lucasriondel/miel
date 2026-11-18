import { describe, test, expect } from "bun:test";
import { gmailRefusalDetail, isAuthErr, toGmailError } from "./gmailErrors";

describe("isAuthErr", () => {
  test("true for numeric code 401/403", () => {
    expect(isAuthErr({ code: 401 })).toBe(true);
    expect(isAuthErr({ code: 403 })).toBe(true);
  });

  test("true for numeric status 401/403 (when code is absent)", () => {
    expect(isAuthErr({ status: 401 })).toBe(true);
    expect(isAuthErr({ status: 403 })).toBe(true);
  });

  test("true for string code '403' (gaxios sometimes stringifies)", () => {
    expect(isAuthErr({ code: "403" })).toBe(true);
  });

  test("false for other statuses", () => {
    expect(isAuthErr({ code: 404 })).toBe(false);
    expect(isAuthErr({ code: 500 })).toBe(false);
    expect(isAuthErr({ status: 429 })).toBe(false);
  });

  test("false for errors without a code/status", () => {
    expect(isAuthErr(new Error("network"))).toBe(false);
    expect(isAuthErr({})).toBe(false);
    expect(isAuthErr(null)).toBe(false);
  });
});

describe("toGmailError", () => {
  test("maps 401/403 to GmailAuthError carrying the ref", () => {
    const err = toGmailError("messages.list", "email:a@b.c", { code: 403 });
    expect(err._tag).toBe("GmailAuthError");
    expect((err as { ref: string }).ref).toBe("email:a@b.c");
  });

  test("maps anything else to a per-op GmailApiError", () => {
    const err = toGmailError("messages.get", "email:a@b.c", { code: 500 });
    expect(err._tag).toBe("GmailApiError");
    expect((err as { op: string }).op).toBe("messages.get");
  });
});

describe("gmailRefusalDetail", () => {
  test("prefers the API's own message over gaxios's", () => {
    const err = {
      message: "Request failed with status code 400",
      response: { data: { error: { message: "Invalid To header" } } },
    };
    expect(gmailRefusalDetail(err)).toBe("Invalid To header");
  });

  test("falls back to errors[0] and then to the thrown message", () => {
    expect(gmailRefusalDetail({ errors: [{ message: "Bad Request" }] })).toBe("Bad Request");
    expect(gmailRefusalDetail(new Error("socket hang up"))).toBe("socket hang up");
  });

  test("scrubs anything token-shaped before it can reach an HTTP body", () => {
    const detail = gmailRefusalDetail({
      message: "failed with Authorization: Bearer ya29.a0AfH6SMBsecret and ya29.other-token",
    });
    expect(detail).not.toContain("ya29.");
    expect(detail).not.toContain("secret");
    expect(detail).toContain("[redacted]");
  });

  test("answers nothing when there is nothing to say", () => {
    expect(gmailRefusalDetail(null)).toBeUndefined();
    expect(gmailRefusalDetail({ message: "  " })).toBeUndefined();
  });

  test("keeps a runaway message to one line's worth", () => {
    expect(gmailRefusalDetail({ message: "x".repeat(1000) })!.length).toBeLessThanOrEqual(301);
  });
});
