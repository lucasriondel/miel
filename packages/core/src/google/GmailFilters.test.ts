import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Effect, Layer } from "effect";
import type { OAuth2Client } from "google-auth-library";
import { runExit, expectFailureTag, expectSuccess } from "../testkit/runExit";
import { GmailFilters, GoogleAuth, type GoogleAuthImpl } from "./contracts";

// ── googleapis mock ──────────────────────────────────────────────────────────
// Each test sets these before exercising the service.
let filtersListImpl: () => Promise<unknown>;
let filtersCreateImpl: (args: unknown) => Promise<unknown>;
let filtersDeleteImpl: (args: unknown) => Promise<unknown>;

mock.module("googleapis", () => ({
  google: {
    gmail: () => ({
      users: {
        settings: {
          filters: {
            list: () => filtersListImpl(),
            create: (args: unknown) => filtersCreateImpl(args),
            delete: (args: unknown) => filtersDeleteImpl(args),
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
const { GmailFiltersLive } = await import("./GmailFilters");
const TestLayer = Layer.merge(GmailFiltersLive, TestAuth);

const run = <A, E>(eff: Effect.Effect<A, E, GmailFilters | GoogleAuth>) =>
  runExit(Effect.provide(eff, TestLayer));

describe("GmailFilters", () => {
  beforeEach(() => {
    filtersListImpl = async () => ({ data: { filter: [] } });
    filtersCreateImpl = async () => ({ data: { id: "f0" } });
    filtersDeleteImpl = async () => ({ data: {} });
  });

  test("list returns parsed filters", async () => {
    filtersListImpl = async () => ({
      data: {
        filter: [{ id: "f1", criteria: { from: "x@y.z" }, action: { addLabelIds: ["L1"] } }],
      },
    });
    const exit = await run(Effect.flatMap(GmailFilters, (s) => s.list({ email: "a@b.c" })));
    const filters = expectSuccess(exit);
    expect(filters).toEqual([
      { id: "f1", criteria: { from: "x@y.z" }, action: { addLabelIds: ["L1"] } },
    ]);
  });

  test("list maps a 401 to GmailAuthError", async () => {
    filtersListImpl = async () => {
      throw { code: 401, message: "unauthorized" };
    };
    const exit = await run(Effect.flatMap(GmailFilters, (s) => s.list({ email: "a@b.c" })));
    expectFailureTag(exit, "GmailAuthError");
  });

  test("create returns the new filter built from the spec", async () => {
    let received: unknown;
    filtersCreateImpl = async (args) => {
      received = args;
      return { data: { id: "f9", criteria: {}, action: {} } };
    };
    const exit = await run(
      Effect.flatMap(GmailFilters, (s) =>
        s.create({ email: "a@b.c" }, { from: "x@y.z", addLabelId: "L1" }),
      ),
    );
    const filter = expectSuccess(exit);
    expect(filter.id).toBe("f9");
    // The spec is translated into Gmail's criteria/action request body.
    expect(received).toMatchObject({
      requestBody: {
        criteria: { from: "x@y.z" },
        action: { addLabelIds: ["L1"] },
      },
    });
  });

  // A merged filter carries the union of its sources' actions, which is more
  // than the one label the accept-suggestion path needs.
  test("create sends a whole union action: many labels, removals, forward", async () => {
    let received: unknown;
    filtersCreateImpl = async (args) => {
      received = args;
      return { data: { id: "f10", criteria: {}, action: {} } };
    };
    const exit = await run(
      Effect.flatMap(GmailFilters, (s) =>
        s.create(
          { email: "a@b.c" },
          {
            query: "{from:a@x.com OR from:b@y.com}",
            addLabelIds: ["L1", "L2"],
            removeLabelIds: ["INBOX"],
            forward: "ops@x.com",
          },
        ),
      ),
    );
    expectSuccess(exit);
    expect(received).toMatchObject({
      requestBody: {
        criteria: { query: "{from:a@x.com OR from:b@y.com}" },
        action: {
          addLabelIds: ["L1", "L2"],
          removeLabelIds: ["INBOX"],
          forward: "ops@x.com",
        },
      },
    });
  });

  test("create omits empty action lists rather than sending []", async () => {
    let received: { requestBody?: { action?: Record<string, unknown> } } = {};
    filtersCreateImpl = async (args) => {
      received = args as typeof received;
      return { data: { id: "f11", criteria: {}, action: {} } };
    };
    const exit = await run(
      Effect.flatMap(GmailFilters, (s) =>
        s.create(
          { email: "a@b.c" },
          { query: "from:a@x.com", addLabelIds: ["L1"], removeLabelIds: [] },
        ),
      ),
    );
    expectSuccess(exit);
    expect(received.requestBody?.action).toEqual({ addLabelIds: ["L1"] });
  });

  test("create failure maps to GmailFilterError", async () => {
    filtersCreateImpl = async () => {
      throw new Error("filter creation failed");
    };
    const exit = await run(
      Effect.flatMap(GmailFilters, (s) =>
        s.create({ email: "a@b.c" }, { from: "x@y.z", addLabelId: "L1" }),
      ),
    );
    expectFailureTag(exit, "GmailFilterError");
  });

  test("delete removes the filter by id", async () => {
    let received: unknown;
    filtersDeleteImpl = async (args) => {
      received = args;
      return { data: {} };
    };
    const exit = await run(Effect.flatMap(GmailFilters, (s) => s.delete({ email: "a@b.c" }, "f1")));
    expectSuccess(exit);
    expect(received).toEqual({ userId: "me", id: "f1" });
  });

  test("delete maps a 401 to GmailAuthError", async () => {
    filtersDeleteImpl = async () => {
      throw { code: 401, message: "unauthorized" };
    };
    const exit = await run(Effect.flatMap(GmailFilters, (s) => s.delete({ email: "a@b.c" }, "f1")));
    expectFailureTag(exit, "GmailAuthError");
  });

  test("delete failure maps to GmailFilterError", async () => {
    filtersDeleteImpl = async () => {
      throw new Error("filter deletion failed");
    };
    const exit = await run(Effect.flatMap(GmailFilters, (s) => s.delete({ email: "a@b.c" }, "f1")));
    expectFailureTag(exit, "GmailFilterError");
  });
});
