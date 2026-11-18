import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import type { OAuth2Client } from "google-auth-library";
import { runExit, expectFailureTag, expectSuccess } from "../testkit/runExit";
import { GmailDrafts, GoogleAuth, type GoogleAuthImpl } from "./contracts";

// ── googleapis mock ──────────────────────────────────────────────────────────
let createImpl: (args: unknown) => Promise<unknown>;
let updateImpl: (args: unknown) => Promise<unknown>;
let deleteImpl: (args: unknown) => Promise<unknown>;
const calls: { op: string; args: unknown }[] = [];

mock.module("googleapis", () => ({
  google: {
    gmail: () => ({
      users: {
        drafts: {
          create: (args: unknown) => {
            calls.push({ op: "create", args });
            return createImpl(args);
          },
          update: (args: unknown) => {
            calls.push({ op: "update", args });
            return updateImpl(args);
          },
          delete: (args: unknown) => {
            calls.push({ op: "delete", args });
            return deleteImpl(args);
          },
        },
      },
    }),
  },
}));

const fakeAuth: GoogleAuthImpl = {
  clientFor: () => Effect.succeed({} as OAuth2Client),
  consentUrl: () => Effect.succeed("https://consent"),
  exchangeCode: () => Effect.succeed({ refreshToken: "r", scopes: [], accessToken: "a" }),
  profileFromToken: () => Effect.succeed({ email: "", displayName: null, avatarUrl: null }),
};
const TestAuth = Layer.succeed(GoogleAuth, fakeAuth);

const { GmailDraftsLive } = await import("./GmailDrafts");
const TestLayer = Layer.merge(GmailDraftsLive, TestAuth);

const run = <A, E>(eff: Effect.Effect<A, E, GmailDrafts | GoogleAuth>) =>
  runExit(Effect.provide(eff, TestLayer));

const ref = { email: "a@b.c" };
const message = { to: ["x@y.z"], subject: "Hello", body: "Draft body" };

type DraftCall = { id?: string; requestBody: { message: { raw: string; threadId?: string } } };

describe("GmailDrafts", () => {
  beforeEach(() => {
    calls.length = 0;
    createImpl = async () => ({ data: { id: "d1", message: { id: "m1", threadId: "t1" } } });
    updateImpl = async () => ({ data: { id: "d1", message: { id: "m2", threadId: "t1" } } });
    deleteImpl = async () => ({ data: {} });
  });

  test("save with no draftId creates one and answers its ids", async () => {
    const exit = await run(Effect.flatMap(GmailDrafts, (s) => s.save(ref, { message })));
    expect(expectSuccess(exit)).toEqual({ draftId: "d1", messageId: "m1", threadId: "t1" });
    expect(calls.map((c) => c.op)).toEqual(["create"]);
    const body = (calls[0].args as DraftCall).requestBody.message;
    expect(body).not.toHaveProperty("threadId");
    expect(Buffer.from(body.raw, "base64url").toString("utf8")).toContain("Draft body");
  });

  // Idempotent on the id: the autosave replaces rather than piling up copies.
  test("save naming a draftId replaces that draft", async () => {
    const exit = await run(
      Effect.flatMap(GmailDrafts, (s) => s.save(ref, { draftId: "d1", message })),
    );
    expect(expectSuccess(exit).draftId).toBe("d1");
    expect(calls.map((c) => c.op)).toEqual(["update"]);
    expect((calls[0].args as DraftCall).id).toBe("d1");
  });

  test("a reply draft is filed in its thread", async () => {
    await run(
      Effect.flatMap(GmailDrafts, (s) =>
        s.save(ref, { message: { ...message, threadId: "t9", inReplyToHeader: "<o@mail>" } }),
      ),
    );
    const body = (calls[0].args as DraftCall).requestBody.message;
    expect(body.threadId).toBe("t9");
    expect(Buffer.from(body.raw, "base64url").toString("utf8")).toContain("In-Reply-To: <o@mail>");
  });

  test("delete removes the named draft", async () => {
    const exit = await run(Effect.flatMap(GmailDrafts, (s) => s.delete(ref, "d1")));
    expect(expectSuccess(exit)).toBeUndefined();
    expect(calls).toEqual([{ op: "delete", args: { userId: "me", id: "d1" } }]);
  });

  test("a refused save maps to GmailApiError", async () => {
    createImpl = async () => {
      throw { code: 400, message: "bad" };
    };
    const exit = await run(Effect.flatMap(GmailDrafts, (s) => s.save(ref, { message })));
    expectFailureTag(exit, "GmailApiError");
  });
});
