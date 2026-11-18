import { describe, expect, test } from "bun:test";
import {
  forwardBody,
  forwardSubject,
  replySubject,
  replyToLine,
  replyWindowTitle,
} from "./replyDefaults";
import type { MessageDetail } from "../../api/types";

// What the compose window is prefilled with when it opens on a message (#96).
// The window itself is blank; these three are the reply's own answers, which is
// the seam a future standalone Compose mounts the same window without.

const message = (over: Partial<MessageDetail> = {}) =>
  ({ fromEmail: "sender@example.com", subject: "Lunch?", ...over }) as MessageDetail;

describe("replyToLine", () => {
  // The server addresses a reply to the sender when the client names nobody
  // (core's `replyRecipients`), so the field has to open showing that same
  // address — otherwise the window would change who a reply reaches.
  test("opens addressed to the sender of the message being answered", () => {
    expect(replyToLine(message())).toBe("sender@example.com");
  });

  test("is empty rather than a stray separator when there is no sender", () => {
    expect(replyToLine(message({ fromEmail: "" }))).toBe("");
  });
});

describe("replySubject", () => {
  test("prefixes Re: once", () => {
    expect(replySubject("Lunch?")).toBe("Re: Lunch?");
  });

  test("does not stack a second Re: on a reply to a reply", () => {
    expect(replySubject("Re: Lunch?")).toBe("Re: Lunch?");
    expect(replySubject("RE: Lunch?")).toBe("RE: Lunch?");
  });

  test("still offers a prefix on a message with no subject", () => {
    expect(replySubject(null)).toBe("Re:");
    expect(replySubject("   ")).toBe("Re:");
  });
});

describe("replyWindowTitle", () => {
  test("names the window after the subject being answered", () => {
    expect(replyWindowTitle("Lunch?")).toBe("Lunch?");
  });

  test("falls back to the copy the rest of the app uses for an empty subject", () => {
    expect(replyWindowTitle(null)).toBe("(no subject)");
    expect(replyWindowTitle("  ")).toBe("(no subject)");
  });
});

describe("forwarding", () => {
  test("prefixes Fwd: once", () => {
    expect(forwardSubject("Lunch?")).toBe("Fwd: Lunch?");
    expect(forwardSubject("Fwd: Lunch?")).toBe("Fwd: Lunch?");
    expect(forwardSubject(null)).toBe("Fwd:");
  });

  test("quotes the original as text under the header block, and owns up to attachments", () => {
    const body = forwardBody({
      fromEmail: "db@bahn.de",
      fromName: "Deutsche Bahn",
      internalDate: "2026-10-27T09:14:00.000Z",
      subject: "Your journey",
      toEmails: ["you@example.com"],
      bodyText: "ICE 9551 departs 08:16.",
      snippet: null,
      attachments: [{ attachmentId: "a", filename: "t.pdf", mimeType: "application/pdf", size: 1 }],
    });
    expect(body.startsWith("\n\n---------- Forwarded message ---------\n")).toBe(true);
    expect(body).toContain("From: Deutsche Bahn <db@bahn.de>");
    expect(body).toContain("Subject: Your journey");
    expect(body).toContain("To: you@example.com");
    expect(body).toContain("ICE 9551 departs 08:16.");
    expect(body).toContain("(1 attachment(s) not included)");
  });
});
