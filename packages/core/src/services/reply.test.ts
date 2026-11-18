// Writing mail — answering a message, writing a new one, and having the model
// draft either — through the store seam, a recording Gmail and the `Claude`
// fake. No database and no module mock.
import { beforeEach, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Cause, Effect, Exit, Layer } from "effect";
import { Claude, type ClaudeImpl, type ClaudeRunResult } from "../claude/Claude";
import type { ReplyTaskInputT } from "../schemas/reply";
import type { Stores } from "../stores/contracts";
import { fakeClaude } from "../testkit/claude";
import { makeRecordingGmail, type RecordingGmail } from "../testkit/gmail";
import { runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import {
  generateNewMessageEffect,
  generateReplyEffect,
  sendNewMessageEffect,
  sendReplyEffect,
} from "./reply";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const EMAIL = "me@example.com";

let stores: TestStores;
let gmail: RecordingGmail;

beforeEach(() => {
  gmail = makeRecordingGmail();
  stores = makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: EMAIL }],
      messages: [
        {
          accountId: ACCOUNT,
          gmailMessageId: "m1",
          gmailThreadId: "thread-1",
          fromEmail: "claire@example.com",
          toEmails: [EMAIL, "bob@example.com"],
          subject: "Dinner",
          bodyText: "Shall we say 8?",
          rawHeaders: { cc: "carol@example.com" },
        },
      ],
    },
  });
});

const drafting = (calls: ReplyTaskInputT[]): ClaudeImpl =>
  fakeClaude((task, input) => {
    expect(task).toBe("reply");
    calls.push(input as ReplyTaskInputT);
    return Effect.succeed<ClaudeRunResult<unknown>>({
      output: { subject: "Dinner at 9", body: "Let's push to 9, I'll book." },
      runId: "run-1",
      model: "claude-haiku-4-5",
    });
  });

const withClaude = <A>(eff: Effect.Effect<A, Error, Claude | Stores>, claude: ClaudeImpl) =>
  Effect.provide(eff, Layer.merge(stores.layer, Layer.succeed(Claude, claude)));

describe("sendReplyEffect", () => {
  test("answers the thread the reply went into, beside its message id", async () => {
    const result = await stores.run(
      sendReplyEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        subject: "Re: Dinner",
        body: "Yes",
        gmail: gmail.adapter,
      }),
    );

    expect(result).toEqual({ ok: true, sentMessageId: "sent-1", threadId: "thread-of-m1" });
    expect(gmail.sent[0]).toMatchObject({ to: ["claire@example.com"], replyToMessageId: "m1" });
    expect(gmail.sent[0].cc).toBeUndefined();
  });

  test("reply-all copies the other participants, never the account itself", async () => {
    await stores.run(
      sendReplyEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        subject: "Re: Dinner",
        body: "Yes",
        replyAll: true,
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.sent[0]).toMatchObject({
      to: ["claire@example.com"],
      cc: ["bob@example.com", "carol@example.com"],
    });
  });

  test("carries a Bcc through to Gmail", async () => {
    await stores.run(
      sendReplyEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        subject: "Re: Dinner",
        body: "Yes",
        bcc: ["archive@example.com"],
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.sent[0].bcc).toEqual(["archive@example.com"]);
  });

  test("deletes the autosaved draft once the reply is sent", async () => {
    await stores.run(
      sendReplyEffect({
        accountId: ACCOUNT,
        gmailMessageId: "m1",
        subject: "Re: Dinner",
        body: "Yes",
        draftId: "draft-7",
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.deletedDrafts).toEqual([{ account: EMAIL, draftId: "draft-7" }]);
  });

  test("refuses a message that is not stored, sending nothing", async () => {
    const exit = await runExit(
      stores.provide(
        sendReplyEffect({
          accountId: ACCOUNT,
          gmailMessageId: "nope",
          subject: "Re: x",
          body: "x",
          gmail: gmail.adapter,
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(gmail.sent).toEqual([]);
  });
});

describe("sendNewMessageEffect", () => {
  test("sends from the account with no thread, and answers the new thread", async () => {
    const result = await stores.run(
      sendNewMessageEffect({
        accountId: ACCOUNT,
        to: [" claire@example.com ", ""],
        cc: [],
        bcc: ["me-too@example.com"],
        subject: "Dinner",
        body: "Push to 9?",
        gmail: gmail.adapter,
      }),
    );

    expect(result).toEqual({ ok: true, sentMessageId: "sent-1", threadId: "thread-1" });
    expect(gmail.sent).toEqual([
      {
        account: EMAIL,
        to: ["claire@example.com"],
        bcc: ["me-too@example.com"],
        subject: "Dinner",
        body: "Push to 9?",
      },
    ]);
  });

  test("refuses a To that cleans away to nothing, asking Gmail nothing", async () => {
    const exit = await runExit(
      stores.provide(
        sendNewMessageEffect({
          accountId: ACCOUNT,
          to: ["  "],
          subject: "x",
          body: "x",
          gmail: gmail.adapter,
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(gmail.sent).toEqual([]);
  });

  test("refuses an account that is not connected", async () => {
    const exit = await runExit(
      stores.provide(
        sendNewMessageEffect({
          accountId: "22222222-2222-4222-8222-222222222222",
          to: ["a@b.c"],
          subject: "x",
          body: "x",
          gmail: gmail.adapter,
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(gmail.sent).toEqual([]);
  });

  test("Gmail's refusal reaches the caller unchanged, and no draft is deleted", async () => {
    const refusal = Object.assign(new Error(""), { _tag: "GmailSendError", detail: "Invalid To" });
    gmail.fails = refusal;

    const exit = await runExit(
      stores.provide(
        sendNewMessageEffect({
          accountId: ACCOUNT,
          to: ["a@b.c"],
          subject: "x",
          body: "x",
          draftId: "draft-1",
          gmail: gmail.adapter,
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(refusal);
    expect(gmail.deletedDrafts).toEqual([]);
  });
});

describe("generating with the reply task", () => {
  test("a reply inlines the message being answered", async () => {
    const calls: ReplyTaskInputT[] = [];
    const result = await Effect.runPromise(
      withClaude(
        generateReplyEffect({ accountId: ACCOUNT, gmailMessageId: "m1", prompt: "say yes" }),
        drafting(calls),
      ),
    );

    expect(result).toEqual({
      subject: "Dinner at 9",
      body: "Let's push to 9, I'll book.",
      model: "claude-haiku-4-5",
      runId: "run-1",
    });
    expect(calls[0]).toMatchObject({ from: "claire@example.com", body: "Shall we say 8?" });
  });

  // No source message: the task is told who is writing and what was typed, and
  // is handed no body — which is why the published body-bearing list is
  // unchanged by this door.
  test("a new message is drafted from the instruction alone, with no body", async () => {
    const calls: ReplyTaskInputT[] = [];
    const result = await Effect.runPromise(
      withClaude(
        generateNewMessageEffect({
          accountId: ACCOUNT,
          prompt: "push dinner to 9, I'll book",
          to: ["claire@example.com", " "],
          subject: "  ",
        }),
        drafting(calls),
      ),
    );

    expect(result.subject).toBe("Dinner at 9");
    expect(calls).toEqual([
      {
        sender: EMAIL,
        to: ["claire@example.com"],
        subject: null,
        userInstruction: "push dinner to 9, I'll book",
      },
    ]);
    expect(calls[0]).not.toHaveProperty("body");
  });
});
