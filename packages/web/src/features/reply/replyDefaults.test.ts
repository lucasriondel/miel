import { describe, expect, test } from "bun:test";
import { replySubject, replyToLine, replyWindowTitle } from "./replyDefaults";
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
