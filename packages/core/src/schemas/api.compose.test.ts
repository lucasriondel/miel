// The compose doors and the Done view's filter, at the edge. Schemas only — no
// db, no environment, so this needs no Postgres.
import { describe, expect, test } from "bun:test";
import {
  GenerateMessageRequest,
  ListMessagesQuery,
  SaveDraftRequest,
  SendMessageRequest,
  SendReplyRequest,
} from "./api";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

describe("ListMessagesQuery.archivedOnly", () => {
  // `z.coerce.boolean()` reads "false" as true; this one must not.
  test("is true only for the literal 'true'", () => {
    expect(ListMessagesQuery.parse({ archivedOnly: "true" }).archivedOnly).toBe(true);
    expect(ListMessagesQuery.parse({ archivedOnly: "false" }).archivedOnly).toBe(false);
    expect(ListMessagesQuery.parse({}).archivedOnly).toBe(false);
    expect(ListMessagesQuery.safeParse({ archivedOnly: "yes" }).success).toBe(false);
  });
});

describe("SendMessageRequest", () => {
  const base = { accountId: ACCOUNT, to: ["a@b.c"], subject: "", body: "hi" };

  test("takes a new message with optional Cc, Bcc and draft", () => {
    expect(
      SendMessageRequest.parse({ ...base, cc: ["c@d.e"], bcc: ["f@g.h"], draftId: "r-1" }),
    ).toEqual({ ...base, cc: ["c@d.e"], bcc: ["f@g.h"], draftId: "r-1" });
  });

  // There is no stored message to default from, so nobody is nobody.
  test("refuses a new message addressed to nobody, or with no body", () => {
    expect(SendMessageRequest.safeParse({ ...base, to: [] }).success).toBe(false);
    expect(SendMessageRequest.safeParse({ ...base, body: "" }).success).toBe(false);
  });
});

describe("SendReplyRequest", () => {
  test("takes Bcc, reply-all and a draft beside what it took before", () => {
    const body = { subject: "Re: x", body: "y", bcc: ["z@y.x"], replyAll: true, draftId: "r-1" };
    expect(SendReplyRequest.parse(body)).toEqual(body);
  });
});

describe("GenerateMessageRequest", () => {
  test("needs an account and an instruction; the rest are hints", () => {
    expect(GenerateMessageRequest.parse({ accountId: ACCOUNT, prompt: "p" })).toEqual({
      accountId: ACCOUNT,
      prompt: "p",
    });
    expect(GenerateMessageRequest.safeParse({ accountId: ACCOUNT, prompt: "" }).success).toBe(
      false,
    );
  });
});

describe("SaveDraftRequest", () => {
  test("a draft may be all empty — it is what is unfinished", () => {
    expect(SaveDraftRequest.parse({ accountId: ACCOUNT })).toEqual({
      accountId: ACCOUNT,
      to: [],
      subject: "",
      body: "",
    });
  });
});
