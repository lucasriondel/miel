import { describe, test, expect } from "bun:test";
import { buildMimeMessage, buildRawMessage, formatAddress } from "./rfc822";

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

  // Bcc travels as a header in `raw`; Gmail delivers to it and strips it from
  // what the recipients see, so the header is the whole of the mechanism.
  test("carries a Bcc header when the caller supplies one, and none otherwise", () => {
    const withBcc = decode(
      buildRawMessage({ to: ["a@b.c"], bcc: ["d@e.f"], subject: "hi", body: "hey" }),
    );
    const [headerBlock] = withBcc.split("\r\n\r\n");
    expect(headerBlock).toContain("Bcc: d@e.f");

    for (const bcc of [undefined, []]) {
      const message = decode(buildRawMessage({ to: ["a@b.c"], bcc, subject: "hi", body: "hey" }));
      expect(message).not.toContain("Bcc:");
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

const boundaryOf = (mime: string, type: string) =>
  new RegExp(`Content-Type: ${type}; boundary="([^"]+)"`).exec(mime)?.[1];

describe("buildMimeMessage — the multipart cases", () => {
  test("an HTML body makes the message multipart/alternative, text first", () => {
    const mime = buildMimeMessage({
      to: ["a@b.c"],
      subject: "Hi",
      body: "plain words",
      html: "<p>html words</p>",
    });
    const boundary = boundaryOf(mime, "multipart/alternative");
    expect(boundary).toBeDefined();
    const parts = mime.split(`--${boundary}`);
    // preamble, text, html, closing "--"
    expect(parts).toHaveLength(4);
    expect(parts[1]).toContain("text/plain");
    expect(parts[2]).toContain("text/html");
    const htmlBody = parts[2].split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(htmlBody, "base64").toString("utf8")).toBe("<p>html words</p>");
  });

  test("attachments wrap the body in multipart/mixed, bytes intact", () => {
    const bytes = new Uint8Array(200).map((_, i) => (i * 7) % 256);
    const mime = buildMimeMessage({
      to: ["a@b.c"],
      subject: "Tickets",
      body: "Attached.",
      attachments: [{ filename: "Billet µ.pdf", mimeType: "application/pdf", data: bytes }],
    });
    const boundary = boundaryOf(mime, "multipart/mixed");
    expect(boundary).toBeDefined();
    const parts = mime.split(`--${boundary}`);
    expect(parts[1]).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(parts[1]).toContain("Attached.");
    const file = parts[2];
    expect(file).toContain("Content-Type: application/pdf; name=");
    // A non-ASCII filename is RFC 2047-encoded rather than sent raw.
    expect(file).toContain('filename="=?UTF-8?B?');
    const encoded = file.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect([...Buffer.from(encoded, "base64")]).toEqual([...bytes]);
    // No base64 line outgrows the 76 columns MIME allows.
    for (const line of file.split("\r\n")) expect(line.length).toBeLessThanOrEqual(998);
  });

  test("an unusable MIME type travels as octet-stream", () => {
    const mime = buildMimeMessage({
      to: ["a@b.c"],
      subject: "x",
      body: "x",
      attachments: [
        { filename: "a", mimeType: "not a type\r\nX-Evil: 1", data: new Uint8Array([1]) },
      ],
    });
    expect(mime).toContain("Content-Type: application/octet-stream;");
    expect(mime).not.toContain("X-Evil");
  });

  test("a From and a Message-ID are written when given, and only then", () => {
    const withBoth = buildMimeMessage({
      to: ["a@b.c"],
      subject: "x",
      body: "x",
      from: formatAddress("me@example.com", "Lucas — Pro"),
      messageId: "<abc@miel>",
    });
    expect(withBoth).toContain("From: =?UTF-8?B?");
    expect(withBoth).toContain("<me@example.com>");
    expect(withBoth).toContain("Message-ID: <abc@miel>");

    const bare = buildMimeMessage({ to: ["a@b.c"], subject: "x", body: "x" });
    expect(bare).not.toContain("From:");
    expect(bare).not.toContain("Message-ID:");
  });

  test("an ASCII display name is quoted", () => {
    expect(formatAddress("a@b.c", 'Claire "CM" Martin')).toBe('"Claire \\"CM\\" Martin" <a@b.c>');
    expect(formatAddress("a@b.c", null)).toBe("a@b.c");
  });
});
