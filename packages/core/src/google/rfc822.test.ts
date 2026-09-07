import { describe, test, expect } from "bun:test";
import { buildRawMessage } from "./rfc822";

// Decode Gmail's base64url `raw` value back to the original MIME string.
const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("buildRawMessage", () => {
  test("output is valid base64url (no padding, url-safe alphabet)", () => {
    const raw = buildRawMessage({
      to: ["a@b.c"],
      subject: "Re: hello",
      body: "hi there",
    });
    // base64url uses only A-Za-z0-9_- and never '=' padding.
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(raw).not.toContain("=");
  });

  test("decodes to headers + body with threading headers when inReplyTo given", () => {
    const raw = buildRawMessage({
      to: ["alice@example.com"],
      subject: "Re: project update",
      body: "Sounds good.",
      inReplyTo: "<abc123@mail.gmail.com>",
    });
    const message = decode(raw);

    expect(message).toContain("To: alice@example.com");
    expect(message).toContain("Subject: Re: project update");
    expect(message).toContain("In-Reply-To: <abc123@mail.gmail.com>");
    expect(message).toContain("References: <abc123@mail.gmail.com>");

    // The body follows a blank line (CRLF CRLF) separating it from the headers.
    const [headerBlock, body] = message.split("\r\n\r\n");
    expect(headerBlock).toContain("To: alice@example.com");
    expect(body).toBe("Sounds good.");
  });

  test("omits threading headers when inReplyTo is absent", () => {
    const raw = buildRawMessage({
      to: ["bob@example.com"],
      subject: "Re: no reply id",
      body: "Fresh thread.",
    });
    const message = decode(raw);

    expect(message).not.toContain("In-Reply-To:");
    expect(message).not.toContain("References:");
  });

  // The compose window lets the sender edit Cc (#96), so an address list that
  // is not the To list has to survive the trip to Gmail.
  test("carries a Cc header when the caller supplies one", () => {
    const raw = buildRawMessage({
      to: ["alice@example.com"],
      cc: ["bob@example.com", "carol@example.com"],
      subject: "Re: lunch",
      body: "Sounds good.",
    });
    const message = decode(raw);

    expect(message).toContain("Cc: bob@example.com, carol@example.com");
    // Header block only — a Cc line loose in the body would be text, not a header.
    const [headerBlock] = message.split("\r\n\r\n");
    expect(headerBlock).toContain("Cc: bob@example.com, carol@example.com");
  });

  test("omits Cc entirely when there is none", () => {
    for (const cc of [undefined, []]) {
      const message = decode(
        buildRawMessage({ to: ["a@b.c"], cc, subject: "Re: hi", body: "hey" }),
      );
      expect(message).not.toContain("Cc:");
    }
  });

  test("RFC 2047 encodes a non-ASCII subject", () => {
    const subject = "Re: café ☕";
    const raw = buildRawMessage({
      to: ["c@d.e"],
      subject,
      body: "body",
    });
    const message = decode(raw);

    // Non-ASCII headers are encoded as =?UTF-8?B?<base64>?= (RFC 2047).
    const expected = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
    expect(message).toContain(`Subject: ${expected}`);
    // The raw non-ASCII text must not leak through unencoded.
    expect(message).not.toContain("café");
  });
});
