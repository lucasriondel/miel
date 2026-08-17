import { describe, expect, test } from "bun:test";
import { defaultReplyTo, resolveReplyRecipients } from "./replyRecipients";

// Who a reply is addressed to used to be entirely the server's business: the
// stored message decided, and the UI had no To field at all. The compose window
// (#96) makes To and Cc editable, so the rule is now "what the sender typed, or
// the old default when they typed nothing" — a pure decision, kept out of the
// Effect that reaches Gmail so it can be read without a database.

const message = { fromEmail: "sender@example.com", toEmails: ["me@example.com"] };

describe("defaultReplyTo", () => {
  test("addresses the sender of the message being replied to", () => {
    expect(defaultReplyTo(message)).toEqual(["sender@example.com"]);
  });

  // A message whose sender is already among its recipients (a note to self, a
  // list that reflects) has no separate sender to answer, so the To line stands.
  test("keeps the original recipients when the sender is one of them", () => {
    expect(defaultReplyTo({ fromEmail: "me@example.com", toEmails: ["me@example.com"] })).toEqual([
      "me@example.com",
    ]);
  });

  test("falls back to the sender when nothing was stored", () => {
    expect(defaultReplyTo({ fromEmail: "sender@example.com", toEmails: [] })).toEqual([
      "sender@example.com",
    ]);
  });
});

describe("resolveReplyRecipients", () => {
  test("uses the default when the caller names no recipients", () => {
    expect(resolveReplyRecipients(message, {})).toEqual({ to: ["sender@example.com"] });
  });

  test("an edited To replaces the default outright", () => {
    expect(resolveReplyRecipients(message, { to: ["someone@else.test"] })).toEqual({
      to: ["someone@else.test"],
    });
  });

  test("carries Cc through, and omits it when there is none", () => {
    expect(resolveReplyRecipients(message, { cc: ["watcher@example.com"] }).cc).toEqual([
      "watcher@example.com",
    ]);
    expect(resolveReplyRecipients(message, {}).cc).toBeUndefined();
    expect(resolveReplyRecipients(message, { cc: [] }).cc).toBeUndefined();
  });

  test("trims, drops blanks and de-duplicates case-insensitively", () => {
    expect(
      resolveReplyRecipients(message, {
        to: [" a@b.c ", "", "A@B.C", "d@e.f"],
        cc: ["  g@h.i  ", "   "],
      }),
    ).toEqual({ to: ["a@b.c", "d@e.f"], cc: ["g@h.i"] });
  });

  // The UI disables Send on an empty To and the request schema refuses one, so
  // a list that is empty once cleaned is a caller that named nothing — not an
  // instruction to send a reply to nobody.
  test("treats a To that cleans away to nothing as no To at all", () => {
    expect(resolveReplyRecipients(message, { to: ["   "] })).toEqual({
      to: ["sender@example.com"],
    });
  });
});
