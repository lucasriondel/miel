// Unit test for trash filtering in the fetch step.
//
// Issue #22 acceptance criteria: trashed Gmail messages must not be fetched
// into our DB or sent to triage. Even though `-in:trash` is added to the
// Gmail search query (see util/time.test.ts), a message can be trashed in
// the window between search and getMessage. The fetcher must drop those
// post-fetch so they never reach upsert / triage.

import { describe, expect, test } from "bun:test";

// Set BEFORE importing core modules — getEnv() throws otherwise.
process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { Effect, Ref } from "effect";
import { stepFetchMessages } from "./steps";
import { makeGmailLayer } from "./services";
import type { GmailDataAdapter } from "../../google/gmailAdapter";
import type { GogMessageRawT } from "../../schemas/gmail";
import { runPromiseRethrow } from "../../util/effect";

function makeMessage(id: string, labelIds: string[]): GogMessageRawT {
  return {
    id,
    threadId: `t-${id}`,
    labelIds,
    snippet: `snippet ${id}`,
    internalDate: "1700000000000",
    payload: {
      headers: [
        { name: "Subject", value: `subject ${id}` },
        { name: "From", value: "sender@example.com" },
        { name: "To", value: "me@example.com" },
      ],
      body: { data: "" },
    },
  };
}

function makeGmail(messages: Record<string, GogMessageRawT>): GmailDataAdapter {
  return {
    async searchMessages() {
      throw new Error("unexpected");
    },
    async getMessage({ messageId }) {
      const m = messages[messageId];
      if (!m) throw new Error(`no stub for ${messageId}`);
      return m;
    },
    async listLabels() {
      return [];
    },
    async createLabel() {
      throw new Error("unexpected");
    },
    async batchModifyLabels() {},
    async trashThread() {},
    async archiveThread() {},
    async sendReply() {
      return { messageId: "x" };
    },
    async listFilters() {
      return [];
    },
    async createFilter() {
      throw new Error("unexpected");
    },
    async deleteFilter() {
      throw new Error("unexpected");
    },
    async getAttachment() {
      throw new Error("unexpected");
    },
  };
}

describe("stepFetchMessages trash filtering", () => {
  test("drops messages whose labelIds include TRASH", async () => {
    const gmail = makeGmail({
      keep: makeMessage("keep", ["INBOX"]),
      trashed: makeMessage("trashed", ["TRASH"]),
    });

    const layer = makeGmailLayer(gmail);
    const errorsRef = await runPromiseRethrow(Ref.make<string[]>([]));

    const normalized = await runPromiseRethrow(
      stepFetchMessages({
        accountId: "acct-1",
        accountEmail: "user@example.com",
        hits: [{ messageId: "keep" }, { messageId: "trashed" }],
        existingIds: new Set(),
        log: () => {},
        errorsRef,
      }).pipe(Effect.provide(layer)),
    );

    expect(normalized.map((n) => n.gmailMessageId)).toEqual(["keep"]);
  });
});
