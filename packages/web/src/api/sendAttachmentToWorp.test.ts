import { afterEach, describe, expect, test } from "bun:test";
import { extractFiledFilename, sendAttachmentToWorp } from "./sendAttachmentToWorp";

const originalFetch = globalThis.fetch;

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(response: { status: number; body: unknown }): { calls: Captured[] } {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls };
}

describe("sendAttachmentToWorp", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("POSTs the chosen flow to the send-to-worp route", async () => {
    const { calls } = stubFetch({
      status: 200,
      body: { ok: true, result: { filename: "2026-04_worp_invoice.pdf" } },
    });
    const res = await sendAttachmentToWorp({
      accountId: "acc-1",
      gmailMessageId: "msg-1",
      attachmentId: "att-1",
      flow: "personal",
    });
    expect(res).toEqual({
      ok: true,
      result: { filename: "2026-04_worp_invoice.pdf" },
    });
    expect(calls.length).toBe(1);
    const call = calls[0]!;
    expect(call.url).toContain("/messages/acc-1/msg-1/attachments/att-1/send-to-worp");
    expect(call.init?.method).toBe("POST");
    expect(call.init?.body).toBe(JSON.stringify({ flow: "personal" }));
    const headers = call.init?.headers as Record<string, string>;
    expect(headers.Authorization).toContain("Bearer ");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("percent-encodes ids containing slashes and colons", async () => {
    const { calls } = stubFetch({
      status: 200,
      body: { ok: true, result: null },
    });
    await sendAttachmentToWorp({
      accountId: "user@example.com",
      gmailMessageId: "abc/xyz:1",
      attachmentId: "ATT_1?x=2",
      flow: "pro",
    });
    expect(calls[0]!.url).toContain(
      "/messages/user%40example.com/abc%2Fxyz%3A1/attachments/ATT_1%3Fx%3D2/send-to-worp",
    );
  });

  test("throws with worp's error message on non-2xx", async () => {
    stubFetch({
      status: 502,
      body: { error: "worp_error" },
    });
    let caught: unknown = null;
    try {
      await sendAttachmentToWorp({
        accountId: "a",
        gmailMessageId: "m",
        attachmentId: "x",
        flow: "personal",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect((caught as Error).message).toBe("worp_error");
  });
});

describe("extractFiledFilename", () => {
  test("returns worp's filename when present", () => {
    expect(extractFiledFilename({ filename: "invoice.pdf" })).toBe("invoice.pdf");
    expect(extractFiledFilename({ filedAs: "2026-04.pdf" })).toBe("2026-04.pdf");
    expect(extractFiledFilename({ archivedFilename: "x.pdf" })).toBe("x.pdf");
    expect(extractFiledFilename({ name: "y.pdf" })).toBe("y.pdf");
  });
  test("returns null when no known field matches", () => {
    expect(extractFiledFilename(null)).toBeNull();
    expect(extractFiledFilename(undefined)).toBeNull();
    expect(extractFiledFilename({})).toBeNull();
    expect(extractFiledFilename({ id: "abc" })).toBeNull();
    expect(extractFiledFilename("just a string")).toBeNull();
    expect(extractFiledFilename({ filename: "" })).toBeNull();
  });
});
