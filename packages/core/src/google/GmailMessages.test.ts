import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import type { OAuth2Client } from "google-auth-library";
import { runExit, expectFailureTag, expectSuccess } from "../testkit/runExit";
import { GmailMessages, GoogleAuth, type GoogleAuthImpl, type SendReplyInput } from "./contracts";

// ── googleapis mock ──────────────────────────────────────────────────────────
// Each test sets these before exercising the service.
let messagesListImpl: (args: unknown) => Promise<unknown>;
let messagesGetImpl: (args: unknown) => Promise<unknown>;
let messagesSendImpl: (args: unknown) => Promise<unknown>;
let attachmentsGetImpl: (args: unknown) => Promise<unknown>;

mock.module("googleapis", () => ({
  google: {
    gmail: () => ({
      users: {
        messages: {
          list: (args: unknown) => messagesListImpl(args),
          get: (args: unknown) => messagesGetImpl(args),
          send: (args: unknown) => messagesSendImpl(args),
          attachments: {
            get: (args: unknown) => attachmentsGetImpl(args),
          },
        },
      },
    }),
  },
}));

// A GoogleAuth layer that hands back a dummy client without touching the DB.
const fakeAuth: GoogleAuthImpl = {
  clientFor: () => Effect.succeed({} as OAuth2Client),
  consentUrl: () => Effect.succeed("https://consent"),
  exchangeCode: () => Effect.succeed({ refreshToken: "r", scopes: [], accessToken: "a" }),
  profileFromToken: () => Effect.succeed({ email: "", displayName: null, avatarUrl: null }),
};
const TestAuth = Layer.succeed(GoogleAuth, fakeAuth);

// Import the live layer AFTER the googleapis mock is registered.
const { GmailMessagesLive } = await import("./GmailMessages");
const TestLayer = Layer.merge(GmailMessagesLive, TestAuth);

const run = <A, E>(eff: Effect.Effect<A, E, GmailMessages | GoogleAuth>) =>
  runExit(Effect.provide(eff, TestLayer));

const ref = { email: "a@b.c" };

const sendInput: SendReplyInput = {
  to: ["dest@b.c"],
  subject: "Re: hi",
  body: "hello",
  replyToMessageId: "m0",
  threadId: "t0",
  inReplyToHeader: "<msg0@mail>",
};

describe("GmailMessages", () => {
  beforeEach(() => {
    messagesListImpl = async () => ({ data: { messages: [] } });
    messagesGetImpl = async () => ({ data: {} });
    messagesSendImpl = async () => ({ data: {} });
    attachmentsGetImpl = async () => ({ data: {} });
  });

  test("search returns SearchHit[] and drops empty ids", async () => {
    messagesListImpl = async () => ({
      data: {
        messages: [
          { id: "m1", threadId: "t1" },
          { id: "", threadId: "t2" }, // filtered out (no message id)
          { id: "m3", threadId: "t3" },
        ],
      },
    });
    const exit = await run(Effect.flatMap(GmailMessages, (s) => s.search(ref, "is:unread")));
    const hits = expectSuccess(exit);
    expect(hits).toEqual([
      { messageId: "m1", threadId: "t1" },
      { messageId: "m3", threadId: "t3" },
    ]);
  });

  test("search maps a 403 to GmailAuthError", async () => {
    messagesListImpl = async () => {
      throw { code: 403, message: "forbidden" };
    };
    const exit = await run(Effect.flatMap(GmailMessages, (s) => s.search(ref, "is:unread")));
    expectFailureTag(exit, "GmailAuthError");
  });

  test("get parses the response into GogMessageRaw", async () => {
    messagesGetImpl = async () => ({
      data: {
        id: "m1",
        threadId: "t1",
        labelIds: ["INBOX"],
        snippet: "hi there",
        internalDate: "1700000000000",
        payload: { mimeType: "text/plain", headers: [] },
      },
    });
    const exit = await run(Effect.flatMap(GmailMessages, (s) => s.get(ref, "m1")));
    const msg = expectSuccess(exit);
    expect(msg.id).toBe("m1");
  });

  test("get maps malformed data to GmailParseError", async () => {
    // Missing the required `threadId` field → Zod parse fails.
    messagesGetImpl = async () => ({ data: { id: "m1" } });
    const exit = await run(Effect.flatMap(GmailMessages, (s) => s.get(ref, "m1")));
    expectFailureTag(exit, "GmailParseError");
  });

  test("send returns the sent messageId", async () => {
    messagesSendImpl = async () => ({ data: { id: "sent1" } });
    const exit = await run(Effect.flatMap(GmailMessages, (s) => s.send(ref, sendInput)));
    const result = expectSuccess(exit);
    expect(result.messageId).toBe("sent1");
  });

  test("send failure maps to GmailSendError", async () => {
    messagesSendImpl = async () => {
      throw new Error("send failed");
    };
    const exit = await run(Effect.flatMap(GmailMessages, (s) => s.send(ref, sendInput)));
    expectFailureTag(exit, "GmailSendError");
  });

  test("getAttachment returns base64url-decoded bytes", async () => {
    // "hello" → base64url "aGVsbG8"
    attachmentsGetImpl = async () => ({
      data: { data: "aGVsbG8", size: 5 },
    });
    const exit = await run(
      Effect.flatMap(GmailMessages, (s) => s.getAttachment(ref, "m1", "att-1")),
    );
    const out = expectSuccess(exit);
    expect(out.size).toBe(5);
    expect(Buffer.from(out.data).toString("utf8")).toBe("hello");
  });

  test("getAttachment maps a 403 to GmailAuthError", async () => {
    attachmentsGetImpl = async () => {
      throw { code: 403, message: "forbidden" };
    };
    const exit = await run(
      Effect.flatMap(GmailMessages, (s) => s.getAttachment(ref, "m1", "att-1")),
    );
    expectFailureTag(exit, "GmailAuthError");
  });

  test("getAttachment maps a missing data field to GmailParseError", async () => {
    attachmentsGetImpl = async () => ({ data: {} });
    const exit = await run(
      Effect.flatMap(GmailMessages, (s) => s.getAttachment(ref, "m1", "att-1")),
    );
    expectFailureTag(exit, "GmailParseError");
  });
});
