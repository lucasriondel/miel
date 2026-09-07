import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import type { OAuth2Client } from "google-auth-library";
import { runExit, expectFailureTag, expectSuccess } from "../testkit/runExit";
import { GmailProfile, GoogleAuth, type GoogleAuthImpl } from "./contracts";

// ── googleapis mock ──────────────────────────────────────────────────────────
// The profile service hits oauth2 (not gmail); each test sets this beforehand.
let profileGetImpl: () => Promise<unknown>;

mock.module("googleapis", () => ({
  google: {
    oauth2: () => ({
      userinfo: {
        get: () => profileGetImpl(),
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
const { GmailProfileLive } = await import("./GmailProfile");
const TestLayer = Layer.merge(GmailProfileLive, TestAuth);

const run = <A, E>(eff: Effect.Effect<A, E, GmailProfile | GoogleAuth>) =>
  runExit(Effect.provide(eff, TestLayer));

describe("GmailProfile", () => {
  beforeEach(() => {
    profileGetImpl = async () => ({ data: {} });
  });

  test("profile maps userinfo fields to AccountProfile", async () => {
    profileGetImpl = async () => ({
      data: { email: "a@b.c", name: "Ada", picture: "http://pic" },
    });
    const exit = await run(Effect.flatMap(GmailProfile, (s) => s.profile({ email: "a@b.c" })));
    const profile = expectSuccess(exit);
    expect(profile).toEqual({
      email: "a@b.c",
      displayName: "Ada",
      avatarUrl: "http://pic",
    });
  });

  test("profile defaults missing name/picture to null", async () => {
    profileGetImpl = async () => ({ data: { email: "a@b.c" } });
    const exit = await run(Effect.flatMap(GmailProfile, (s) => s.profile({ email: "a@b.c" })));
    const profile = expectSuccess(exit);
    expect(profile.displayName).toBeNull();
    expect(profile.avatarUrl).toBeNull();
  });

  test("profile failure maps to GmailApiError", async () => {
    profileGetImpl = async () => {
      throw new Error("userinfo blew up");
    };
    const exit = await run(Effect.flatMap(GmailProfile, (s) => s.profile({ email: "a@b.c" })));
    expectFailureTag(exit, "GmailApiError");
  });
});
