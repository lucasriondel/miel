// The compose window's autosave, through the store seam and a recording Gmail.
// The draft lives in Gmail and its id in the client, so what is asserted is the
// conversation with Gmail: create once, replace by id, delete on discard.
import { beforeEach, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Exit } from "effect";
import { makeRecordingGmail, type RecordingGmail } from "../testkit/gmail";
import { runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import { deleteDraftEffect, saveDraftEffect } from "./drafts";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const EMAIL = "me@example.com";

let stores: TestStores;
let gmail: RecordingGmail;

beforeEach(() => {
  gmail = makeRecordingGmail();
  stores = makeTestStores({
    mailbox: {
      accounts: [{ id: ACCOUNT, email: EMAIL }],
      messages: [{ accountId: ACCOUNT, gmailMessageId: "m1", gmailThreadId: "thread-1" }],
    },
  });
});

describe("saveDraftEffect", () => {
  test("the first save creates a draft and answers its id", async () => {
    const result = await stores.run(
      saveDraftEffect({
        accountId: ACCOUNT,
        to: [],
        subject: "",
        body: "Half a thought",
        gmail: gmail.adapter,
      }),
    );

    expect(result).toMatchObject({ ok: true, draftId: "draft-1" });
    expect(gmail.savedDrafts[0]).toMatchObject({ account: EMAIL, to: [], body: "Half a thought" });
    expect(gmail.savedDrafts[0].draftId).toBeUndefined();
  });

  test("a later save names the id, so Gmail replaces rather than piles up", async () => {
    const result = await stores.run(
      saveDraftEffect({
        accountId: ACCOUNT,
        draftId: "draft-1",
        to: ["claire@example.com"],
        subject: "Dinner",
        body: "Whole thought",
        gmail: gmail.adapter,
      }),
    );

    expect(result.draftId).toBe("draft-1");
    expect(gmail.savedDrafts[0]).toMatchObject({ draftId: "draft-1", to: ["claire@example.com"] });
  });

  test("a reply draft names the message it answers", async () => {
    await stores.run(
      saveDraftEffect({
        accountId: ACCOUNT,
        replyToGmailMessageId: "m1",
        to: ["claire@example.com"],
        subject: "Re: Dinner",
        body: "Yes",
        gmail: gmail.adapter,
      }),
    );

    expect(gmail.savedDrafts[0].replyToMessageId).toBe("m1");
  });

  test("refuses a reply draft for a message this account does not have", async () => {
    const exit = await runExit(
      stores.provide(
        saveDraftEffect({
          accountId: ACCOUNT,
          replyToGmailMessageId: "nope",
          to: [],
          subject: "",
          body: "",
          gmail: gmail.adapter,
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(gmail.savedDrafts).toEqual([]);
  });
});

describe("deleteDraftEffect", () => {
  test("deletes the named draft from the account's Gmail", async () => {
    const result = await stores.run(
      deleteDraftEffect({ accountId: ACCOUNT, draftId: "draft-1", gmail: gmail.adapter }),
    );

    expect(result).toEqual({ ok: true });
    expect(gmail.deletedDrafts).toEqual([{ account: EMAIL, draftId: "draft-1" }]);
  });
});
