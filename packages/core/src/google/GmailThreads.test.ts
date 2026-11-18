import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import type { OAuth2Client } from "google-auth-library";
import { runExit, expectFailureTag, expectSuccess } from "../testkit/runExit";
import { GmailThreads, GoogleAuth, type GoogleAuthImpl } from "./contracts";

// ── googleapis mock ──────────────────────────────────────────────────────────
// Each test sets `threadsModifyImpl` before exercising the service; it also
// records the last args so we can assert the requestBody we sent.
let threadsModifyImpl: (args: unknown) => Promise<unknown>;
let lastModifyArgs: unknown;

mock.module("googleapis", () => ({
  google: {
    gmail: () => ({
      users: {
        threads: {
          modify: (args: unknown) => {
            lastModifyArgs = args;
            return threadsModifyImpl(args);
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
const { GmailThreadsLive } = await import("./GmailThreads");
const TestLayer = Layer.merge(GmailThreadsLive, TestAuth);

const run = <A, E>(eff: Effect.Effect<A, E, GmailThreads | GoogleAuth>) =>
  runExit(Effect.provide(eff, TestLayer));

describe("GmailThreads", () => {
  beforeEach(() => {
    threadsModifyImpl = async () => ({ data: {} });
    lastModifyArgs = undefined;
  });

  test("trash adds TRASH + removes INBOX and returns void", async () => {
    const exit = await run(Effect.flatMap(GmailThreads, (s) => s.trash({ email: "a@b.c" }, "T1")));
    expect(expectSuccess(exit)).toBeUndefined();
    expect(lastModifyArgs).toEqual({
      userId: "me",
      id: "T1",
      requestBody: { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] },
    });
  });

  test("archive removes INBOX with no labels added", async () => {
    const exit = await run(
      Effect.flatMap(GmailThreads, (s) => s.archive({ email: "a@b.c" }, "T2")),
    );
    expect(expectSuccess(exit)).toBeUndefined();
    expect(lastModifyArgs).toEqual({
      userId: "me",
      id: "T2",
      requestBody: { addLabelIds: [], removeLabelIds: ["INBOX"] },
    });
  });

  // The undos are the actions read backwards, so a round trip is a no-op.
  test("unarchive puts INBOX back with nothing removed", async () => {
    const exit = await run(
      Effect.flatMap(GmailThreads, (s) => s.unarchive({ email: "a@b.c" }, "T5")),
    );
    expect(expectSuccess(exit)).toBeUndefined();
    expect(lastModifyArgs).toEqual({
      userId: "me",
      id: "T5",
      requestBody: { addLabelIds: ["INBOX"], removeLabelIds: [] },
    });
  });

  test("untrash lifts TRASH and puts INBOX back — trash's exact inverse", async () => {
    const exit = await run(
      Effect.flatMap(GmailThreads, (s) => s.untrash({ email: "a@b.c" }, "T6")),
    );
    expect(expectSuccess(exit)).toBeUndefined();
    expect(lastModifyArgs).toEqual({
      userId: "me",
      id: "T6",
      requestBody: { addLabelIds: ["INBOX"], removeLabelIds: ["TRASH"] },
    });
  });

  test("a 500 throw maps to GmailApiError", async () => {
    threadsModifyImpl = async () => {
      throw { code: 500, message: "server error" };
    };
    const exit = await run(Effect.flatMap(GmailThreads, (s) => s.trash({ email: "a@b.c" }, "T3")));
    expectFailureTag(exit, "GmailApiError");
  });

  test("a 403 throw maps to GmailAuthError", async () => {
    threadsModifyImpl = async () => {
      throw { code: 403, message: "forbidden" };
    };
    const exit = await run(
      Effect.flatMap(GmailThreads, (s) => s.archive({ email: "a@b.c" }, "T4")),
    );
    expectFailureTag(exit, "GmailAuthError");
  });
});
