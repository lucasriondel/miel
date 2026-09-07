import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import type { OAuth2Client } from "google-auth-library";
import { runExit, expectFailureTag, expectSuccess } from "../testkit/runExit";
import { GmailModify, GoogleAuth, type GoogleAuthImpl } from "./contracts";

// ── googleapis mock ──────────────────────────────────────────────────────────
// Each test sets these before exercising the service.
let batchModifyImpl: (args: unknown) => Promise<unknown>;
let batchModifyCalls: unknown[];

mock.module("googleapis", () => ({
  google: {
    gmail: () => ({
      users: {
        messages: {
          batchModify: (args: unknown) => {
            batchModifyCalls.push(args);
            return batchModifyImpl(args);
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
const { GmailModifyLive } = await import("./GmailModify");
const TestLayer = Layer.merge(GmailModifyLive, TestAuth);

const run = <A, E>(eff: Effect.Effect<A, E, GmailModify | GoogleAuth>) =>
  runExit(Effect.provide(eff, TestLayer));

describe("GmailModify", () => {
  beforeEach(() => {
    batchModifyImpl = async () => ({ data: {} });
    batchModifyCalls = [];
  });

  test("empty messageIds is a no-op (no API call)", async () => {
    const exit = await run(
      Effect.flatMap(GmailModify, (s) => s.batch({ email: "a@b.c" }, [], ["L1"], ["L2"])),
    );
    expectSuccess(exit);
    expect(batchModifyCalls.length).toBe(0);
  });

  test("non-empty ids calls batchModify with add/remove label ids", async () => {
    const exit = await run(
      Effect.flatMap(GmailModify, (s) =>
        s.batch({ email: "a@b.c" }, ["m1", "m2"], ["ADD1"], ["RM1"]),
      ),
    );
    expectSuccess(exit);
    expect(batchModifyCalls.length).toBe(1);
    expect(batchModifyCalls[0]).toEqual({
      userId: "me",
      requestBody: {
        ids: ["m1", "m2"],
        addLabelIds: ["ADD1"],
        removeLabelIds: ["RM1"],
      },
    });
  });

  test("401 throw maps to GmailAuthError", async () => {
    batchModifyImpl = async () => {
      throw { code: 401, message: "unauthorized" };
    };
    const exit = await run(
      Effect.flatMap(GmailModify, (s) => s.batch({ email: "a@b.c" }, ["m1"], ["ADD1"], undefined)),
    );
    expectFailureTag(exit, "GmailAuthError");
  });
});
