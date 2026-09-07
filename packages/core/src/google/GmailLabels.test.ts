import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import type { OAuth2Client } from "google-auth-library";
import { runExit, expectFailureTag, expectSuccess } from "../testkit/runExit";
import { GmailLabels, GoogleAuth, type GoogleAuthImpl } from "./contracts";

// ── googleapis mock ──────────────────────────────────────────────────────────
// Each test sets these before exercising the service.
let labelsListImpl: () => Promise<unknown>;
let labelsCreateImpl: (args: unknown) => Promise<unknown>;

mock.module("googleapis", () => ({
  google: {
    gmail: () => ({
      users: {
        labels: {
          list: () => labelsListImpl(),
          create: (args: unknown) => labelsCreateImpl(args),
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
const { GmailLabelsLive } = await import("./GmailLabels");
const TestLayer = Layer.merge(GmailLabelsLive, TestAuth);

const run = <A, E>(eff: Effect.Effect<A, E, GmailLabels | GoogleAuth>) =>
  runExit(Effect.provide(eff, TestLayer));

describe("GmailLabels", () => {
  beforeEach(() => {
    labelsListImpl = async () => ({ data: { labels: [] } });
    labelsCreateImpl = async () => ({ data: {} });
  });

  test("list returns parsed labels", async () => {
    labelsListImpl = async () => ({
      data: { labels: [{ id: "L1", name: "Work" }] },
    });
    const exit = await run(Effect.flatMap(GmailLabels, (s) => s.list({ email: "a@b.c" })));
    const labels = expectSuccess(exit);
    expect(labels).toEqual([{ id: "L1", name: "Work" }]);
  });

  test("list maps a 403 to GmailAuthError", async () => {
    labelsListImpl = async () => {
      throw { code: 403, message: "forbidden" };
    };
    const exit = await run(Effect.flatMap(GmailLabels, (s) => s.list({ email: "a@b.c" })));
    expectFailureTag(exit, "GmailAuthError");
  });

  test("create returns the new label", async () => {
    labelsCreateImpl = async () => ({ data: { id: "L9", name: "New" } });
    const exit = await run(Effect.flatMap(GmailLabels, (s) => s.create({ email: "a@b.c" }, "New")));
    const label = expectSuccess(exit);
    expect(label.id).toBe("L9");
  });

  test("create failure maps to GmailLabelError", async () => {
    labelsCreateImpl = async () => {
      throw new Error("Label name exists");
    };
    const exit = await run(Effect.flatMap(GmailLabels, (s) => s.create({ email: "a@b.c" }, "Dup")));
    expectFailureTag(exit, "GmailLabelError");
  });
});
