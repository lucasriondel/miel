// What a send carries beyond its addresses and text — the quoted original, a
// forward's block and attachments, uploaded files, a send-as From, a second
// mailbox — and what it leaves behind (the recipients, for suggestions). Run
// through the store seam, a recording Gmail and the `Claude` fake: no database
// and no module mock.
import { beforeEach, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Effect, Layer } from "effect";
import { Claude, type ClaudeRunResult } from "../claude/Claude";
import { MAX_ATTACHMENTS_BYTES } from "../composeLimits";
import { formatAddress } from "../google/rfc822";
import type { ReplyTaskInputT } from "../schemas/reply";
import { fakeClaude } from "../testkit/claude";
import { makeRecordingGmail, type RecordingGmail } from "../testkit/gmail";
import { expectFailureTag, runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import {
  forwardMessageEffect,
  generateNewMessageEffect,
  generateReplyEffect,
  quotePreviewEffect,
  sendNewMessageEffect,
  sendReplyEffect,
} from "./reply";
import { suggestContactsEffect } from "./contacts";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EMAIL = "me@example.com";
const OTHER_EMAIL = "pro@example.com";

let stores: TestStores;
let gmail: RecordingGmail;

const PDF = new Uint8Array([37, 80, 68, 70]);

beforeEach(() => {
  gmail = makeRecordingGmail({
    sendAs: [
      { email: EMAIL, displayName: "Me", isPrimary: true, isDefault: true, verified: true },
      {
        email: "alias@example.com",
        displayName: "Lucas — Pro",
        isPrimary: false,
        isDefault: false,
        verified: true,
      },
      {
        email: "pending@example.com",
        displayName: null,
        isPrimary: false,
        isDefault: false,
        verified: false,
      },
    ],
    attachments: { "att-1": PDF, "att-2": new Uint8Array([1, 2, 3]) },
  });
  stores = makeTestStores({
    mailbox: {
      accounts: [
        { id: ACCOUNT, email: EMAIL },
        { id: OTHER, email: OTHER_EMAIL },
      ],
      messages: [
        {
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          gmailThreadId: "thread-1",
          fromEmail: "claire@example.com",
          fromName: "Claire Martin",
          toEmails: [EMAIL],
          subject: "Dinner",
          bodyText: "Shall we say 8?\nBring wine.",
          bodyHtml: "<p>Shall we say <b>8</b>?</p>",
          internalDate: "2025-10-30T18:02:00.000Z",
        },
      ],
      attachments: [
        {
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          attachmentId: "att-1",
          filename: "Quote_Q4.pdf",
        },
        {
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          attachmentId: "att-2",
          filename: "map.png",
          mimeType: "image/png",
        },
      ],
    },
  });
});

const upload = (accountId: string, size = 4) =>
  stores.outbox.putUpload({
    accountId,
    filename: "notes.txt",
    mimeType: "text/plain",
    data: new Uint8Array(size),
  });

describe("the quoted original under a reply", () => {
  test("is sent by default, as > lines under an attribution and as an HTML blockquote", async () => {
    await stores.run(
      sendReplyEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        subject: "Re: Dinner",
        body: "Nine works.",
        gmail: gmail.adapter,
      }),
    );

    const sent = gmail.sent[0];
    expect(sent.body).toBe(
      [
        "Nine works.",
        "",
        "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@example.com> wrote:",
        "> Shall we say 8?",
        "> Bring wine.",
      ].join("\n"),
    );
    expect(sent.html).toContain('<blockquote class="gmail_quote"');
    expect(sent.html).toContain("<p>Shall we say <b>8</b>?</p>");
    expect(sent.html).toContain("Nine works.");
  });

  test("is left off when the caller says so", async () => {
    await stores.run(
      sendReplyEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        subject: "Re: Dinner",
        body: "Nine works.",
        includeQuote: false,
        gmail: gmail.adapter,
      }),
    );
    expect(gmail.sent[0].body).toBe("Nine works.");
    expect(gmail.sent[0].html).toBeUndefined();
  });

  test("is the user's trimmed text when they trimmed it", async () => {
    await stores.run(
      sendReplyEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        subject: "Re: Dinner",
        body: "Nine works.",
        quotedText: "Shall we say 8?",
        gmail: gmail.adapter,
      }),
    );
    expect(gmail.sent[0].body).not.toContain("Bring wine.");
    expect(gmail.sent[0].html).not.toContain("<b>8</b>");
    expect(gmail.sent[0].html).toContain("Shall we say 8?");
  });

  test("is what the quote preview shows, beside the forward block and its files", async () => {
    const preview = await stores.run(
      quotePreviewEffect({ accountId: ACCOUNT, gmailMessageId: "m1" }),
    );
    expect(preview.reply.attribution).toBe(
      "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@example.com> wrote:",
    );
    expect(preview.forward.text).toContain("---------- Forwarded message ---------");
    expect(preview.forward.text).toContain("Subject: Dinner");
    expect(preview.attachments.map((a) => a.attachmentId)).toEqual(["att-1", "att-2"]);
  });
});

describe("a send-as From", () => {
  test("a verified alias is written as the From header, with its display name", async () => {
    await stores.run(
      sendNewMessageEffect({
        accountId: ACCOUNT,
        to: ["claire@example.com"],
        subject: "Hi",
        body: "Hello",
        from: "Alias@Example.com",
        gmail: gmail.adapter,
      }),
    );
    // Gmail's own spelling of the address, and the alias's own display name.
    expect(gmail.sent[0].from).toBe(formatAddress("alias@example.com", "Lucas — Pro"));
  });

  test("an address that is not a verified alias is refused, and nothing is sent", async () => {
    for (const from of ["pending@example.com", "stranger@example.com"]) {
      const exit = await runExit(
        stores.provide(
          sendNewMessageEffect({
            accountId: ACCOUNT,
            to: ["claire@example.com"],
            subject: "Hi",
            body: "Hello",
            from,
            gmail: gmail.adapter,
          }),
        ),
      );
      expectFailureTag(exit, "ComposeRefusedError");
    }
    expect(gmail.sent).toEqual([]);
  });
});

describe("uploaded attachments", () => {
  test("ride with the send, in the order named", async () => {
    const a = await stores.run(upload(ACCOUNT, 3));
    const b = await stores.run(upload(ACCOUNT, 5));
    await stores.run(
      sendNewMessageEffect({
        accountId: ACCOUNT,
        to: ["claire@example.com"],
        subject: "Files",
        body: "Attached.",
        uploadIds: [b.id, a.id],
        gmail: gmail.adapter,
      }),
    );
    expect(gmail.sent[0].attachments?.map((f) => f.data.byteLength)).toEqual([5, 3]);
  });

  test("another account's upload is not this account's to send", async () => {
    const theirs = await stores.run(upload(OTHER));
    const exit = await runExit(
      stores.provide(
        sendNewMessageEffect({
          accountId: ACCOUNT,
          to: ["claire@example.com"],
          subject: "Files",
          body: "Attached.",
          uploadIds: [theirs.id],
          gmail: gmail.adapter,
        }),
      ),
    );
    expectFailureTag(exit, "ComposeRefusedError");
    expect(gmail.sent).toEqual([]);
  });

  test("files adding up to more than Gmail takes are refused before Gmail is asked", async () => {
    const big = await stores.run(upload(ACCOUNT, MAX_ATTACHMENTS_BYTES / 2 + 1));
    const big2 = await stores.run(upload(ACCOUNT, MAX_ATTACHMENTS_BYTES / 2 + 1));
    const exit = await runExit(
      stores.provide(
        sendReplyEffect({
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          subject: "Re: Dinner",
          body: "Files.",
          uploadIds: [big.id, big2.id],
          gmail: gmail.adapter,
        }),
      ),
    );
    expectFailureTag(exit, "ComposeRefusedError");
    expect(gmail.sent).toEqual([]);
  });
});

describe("a reply from another connected mailbox", () => {
  test("is sent from that account with the threading header and no Gmail thread", async () => {
    await stores.run(
      sendReplyEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        fromAccountId: OTHER,
        subject: "Re: Dinner",
        body: "From the other box.",
        gmail: gmail.adapter,
      }),
    );
    expect(gmail.sent[0]).toMatchObject({
      account: OTHER_EMAIL,
      to: ["claire@example.com"],
      threading: { inReplyTo: "<m1@mail>" },
    });
    expect(gmail.sent[0].threading?.threadId).toBeUndefined();
  });
});

describe("a forward", () => {
  test("carries the block, the original's HTML and every attachment by default", async () => {
    const result = await stores.run(
      forwardMessageEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        to: ["bob@example.com"],
        subject: "Fwd: Dinner",
        body: "FYI",
        gmail: gmail.adapter,
      }),
    );
    expect(result.ok).toBe(true);
    const sent = gmail.sent[0];
    expect(sent.body.startsWith("FYI\n\n---------- Forwarded message ---------")).toBe(true);
    expect(sent.body).toContain("From: Claire Martin <claire@example.com>");
    expect(sent.html).toContain("<p>Shall we say <b>8</b>?</p>");
    expect(sent.attachments?.map((a) => a.filename)).toEqual(["Quote_Q4.pdf", "map.png"]);
    expect([...sent.attachments![0].data]).toEqual([...PDF]);
    // Kept in the conversation in this mailbox, as Gmail's own forward is.
    expect(sent.threading).toEqual({ threadId: "gmail-thread-of-m1", inReplyTo: "<m1@mail>" });
  });

  test("carries only the attachments kept, plus any uploaded", async () => {
    const extra = await stores.run(upload(ACCOUNT, 2));
    await stores.run(
      forwardMessageEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        to: ["bob@example.com"],
        subject: "Fwd: Dinner",
        body: "",
        keepAttachmentIds: ["att-2"],
        uploadIds: [extra.id],
        gmail: gmail.adapter,
      }),
    );
    expect(gmail.sent[0].attachments?.map((a) => a.filename)).toEqual(["map.png", "notes.txt"]);
  });

  test("an attachment the original does not carry is refused", async () => {
    const exit = await runExit(
      stores.provide(
        forwardMessageEffect({
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          to: ["bob@example.com"],
          subject: "Fwd: Dinner",
          body: "",
          keepAttachmentIds: ["att-nope"],
          gmail: gmail.adapter,
        }),
      ),
    );
    expectFailureTag(exit, "ComposeRefusedError");
    expect(gmail.sent).toEqual([]);
  });

  test("a forward to nobody is refused", async () => {
    const exit = await runExit(
      stores.provide(
        forwardMessageEffect({
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          to: [" "],
          subject: "Fwd: Dinner",
          body: "",
          gmail: gmail.adapter,
        }),
      ),
    );
    expectFailureTag(exit, "ComposeRefusedError");
  });
});

describe("who a send reached", () => {
  test("is recorded for the address suggestions, never the account itself", async () => {
    await stores.run(
      sendNewMessageEffect({
        accountId: ACCOUNT,
        to: ["Claire Martin <claire@example.com>", EMAIL],
        cc: ["bob@example.com"],
        subject: "Hi",
        body: "Hello",
        gmail: gmail.adapter,
      }),
    );
    const suggestions = await stores.run(suggestContactsEffect({ accountId: ACCOUNT, query: "" }));
    expect(suggestions.map((s) => s.email).toSorted()).toEqual([
      "bob@example.com",
      "claire@example.com",
    ]);
    expect(suggestions.find((s) => s.email === "claire@example.com")?.name).toBe("Claire Martin");
  });

  test("a store that cannot record does not turn a sent mail into a failed one", async () => {
    stores.contacts.offline = true;
    const result = await stores.run(
      sendNewMessageEffect({
        accountId: ACCOUNT,
        to: ["claire@example.com"],
        subject: "Hi",
        body: "Hello",
        gmail: gmail.adapter,
      }),
    );
    expect(result.ok).toBe(true);
  });
});

const drafting = (calls: ReplyTaskInputT[]) =>
  fakeClaude((_task, input) => {
    calls.push(input as ReplyTaskInputT);
    return Effect.succeed<ClaudeRunResult<unknown>>({
      output: { subject: "Re: Dinner", body: "Shorter." },
      runId: "r",
      model: "m",
    });
  });

describe("refining a draft", () => {
  const withClaude = <A, R>(eff: Effect.Effect<A, Error, R>, calls: ReplyTaskInputT[]) =>
    Effect.provide(eff, Layer.merge(stores.layer, Layer.succeed(Claude, drafting(calls))));

  test("hands the model the draft being refined, for a reply and for a new mail", async () => {
    const calls: ReplyTaskInputT[] = [];
    await Effect.runPromise(
      withClaude(
        generateReplyEffect({
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          prompt: "Shorter",
          previousDraft: { subject: "Re: Dinner", body: "A long reply about nine." },
        }),
        calls,
      ),
    );
    await Effect.runPromise(
      withClaude(
        generateNewMessageEffect({
          accountId: ACCOUNT,
          prompt: "Warmer",
          previousDraft: { body: "Dinner at 9." },
        }),
        calls,
      ),
    );
    expect(calls[0]).toMatchObject({
      previousDraft: { subject: "Re: Dinner", body: "A long reply about nine." },
    });
    expect(calls[1]).toMatchObject({ previousDraft: { subject: null, body: "Dinner at 9." } });
    // Still no received body on the new mail: a draft is the user's own text.
    expect(calls[1]).not.toHaveProperty("body");
  });

  test("an empty draft is no draft — the model drafts from scratch", async () => {
    const calls: ReplyTaskInputT[] = [];
    await Effect.runPromise(
      withClaude(
        generateNewMessageEffect({
          accountId: ACCOUNT,
          prompt: "x",
          previousDraft: { body: "  " },
        }),
        calls,
      ),
    );
    expect(calls[0]).not.toHaveProperty("previousDraft");
  });
});
