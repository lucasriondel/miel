import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { messageMutationOptions, sameMessage } from "./messageMutation";
import { listedMessage } from "./listedMessage.fixture";
import type { ListMessagesResponse, ListedMessage } from "./types";

// #131. Thirteen mutations used to write the same five steps out by hand —
// cancel, snapshot, optimistic write, roll back, re-read — and each hand-written
// optimistic helper had to remember that `["messages", params]` holds two
// different cache shapes. The rule now lives in the factory, so it is asserted
// once, here, instead of being a comment a dozen call sites could violate.

// Stubs `fetch` rather than mocking `./client`, for the reason
// `filters.hooks.test.ts` gives: a module mock of the api client is
// process-global and bleeds into sibling suites.
const originalFetch = globalThis.fetch;

function stubFetch(body: unknown = { ok: true }, status = 200): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const INPUT = { accountId: "acc-1", gmailMessageId: "msg-1" };

const plainKey = ["messages", { accountId: "acc-1" }];
const infiniteKey = ["messages", { accountId: "acc-1", priority: "high" }];
const detailKey = ["message", "acc-1", "msg-1"];

const list = (items: ListedMessage[]): ListMessagesResponse => ({ items, nextCursor: null });

const pages = (...items: ListedMessage[][]): InfiniteData<ListMessagesResponse> => ({
  pages: items.map((page) => list(page)),
  pageParams: items.map(() => undefined),
});

/** Both cache shapes, seeded with the same two messages. */
function seed(qc: QueryClient) {
  const one = listedMessage({ gmailMessageId: "msg-1", subject: "one" });
  const two = listedMessage({ gmailMessageId: "msg-2", gmailThreadId: "th-2", subject: "two" });
  qc.setQueryData(plainKey, list([one, two]));
  qc.setQueryData(infiniteKey, pages([one], [two]));
  return qc;
}

const plainSubjects = (qc: QueryClient) =>
  qc.getQueryData<ListMessagesResponse>(plainKey)?.items.map((m) => m.subject);

const infiniteSubjects = (qc: QueryClient) =>
  qc
    .getQueryData<InfiniteData<ListMessagesResponse>>(infiniteKey)
    ?.pages.flatMap((p) => p.items.map((m) => m.subject));

const optionsFor = messageMutationOptions<typeof INPUT, { ok: true }>;

// `apiFetch` resolves the path-only base against the window's origin, and the
// origin is the DOM harness's (#129) rather than one this file builds.
const API = `${window.location.origin}/api`;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("the optimistic write", () => {
  test("reaches both cache shapes the messages key holds", async () => {
    const qc = seed(new QueryClient());

    await optionsFor(qc, {
      request: () => ({ path: "/noop", method: "POST" }),
      optimistic: (input) => (m) => (sameMessage(m, input) ? { ...m, subject: "edited" } : m),
    }).onMutate(INPUT);

    expect(plainSubjects(qc)).toEqual(["edited", "two"]);
    expect(infiniteSubjects(qc)).toEqual(["edited", "two"]);
  });

  test("drops an item from both shapes when the transform returns null", async () => {
    const qc = seed(new QueryClient());

    await optionsFor(qc, {
      request: () => ({ path: "/noop", method: "POST" }),
      optimistic: (input) => (m) => (sameMessage(m, input) ? null : m),
    }).onMutate(INPUT);

    expect(plainSubjects(qc)).toEqual(["two"]);
    expect(infiniteSubjects(qc)).toEqual(["two"]);
  });

  test("plans against every cached message, so a transform can see siblings", async () => {
    const qc = seed(new QueryClient());
    const seen: string[] = [];

    await optionsFor(qc, {
      request: () => ({ path: "/noop", method: "POST" }),
      optimistic: (_input, cached) => {
        seen.push(...cached.map((m) => m.gmailMessageId));
        return (m) => m;
      },
    }).onMutate(INPUT);

    // Both queries, and both pages of the infinite one.
    expect(seen.toSorted()).toEqual(["msg-1", "msg-1", "msg-2", "msg-2"]);
  });

  test("leaves the lists alone when the mutation declares no optimistic write", async () => {
    const qc = seed(new QueryClient());

    await optionsFor(qc, { request: () => ({ path: "/noop", method: "POST" }) }).onMutate(INPUT);

    expect(plainSubjects(qc)).toEqual(["one", "two"]);
    expect(infiniteSubjects(qc)).toEqual(["one", "two"]);
  });
});

describe("rolling back", () => {
  test("restores both cache shapes from the snapshot onMutate took", async () => {
    const qc = seed(new QueryClient());
    const options = optionsFor(qc, {
      request: () => ({ path: "/noop", method: "POST" }),
      optimistic: (input) => (m) => (sameMessage(m, input) ? null : m),
    });

    const context = await options.onMutate(INPUT);
    expect(plainSubjects(qc)).toEqual(["two"]);

    options.onError(new Error("boom"), INPUT, context);

    expect(plainSubjects(qc)).toEqual(["one", "two"]);
    expect(infiniteSubjects(qc)).toEqual(["one", "two"]);
  });

  test("survives a caller with no context — an onMutate that never ran", () => {
    const qc = seed(new QueryClient());

    expect(() =>
      optionsFor(qc, { request: () => ({ path: "/noop", method: "POST" }) }).onError(
        new Error("boom"),
        INPUT,
        undefined,
      ),
    ).not.toThrow();
  });

  test("re-reads the lists and the message from the server after a failure", async () => {
    const qc = seed(new QueryClient());
    qc.setQueryData(detailKey, { gmailMessageId: "msg-1" });
    const options = optionsFor(qc, {
      request: () => ({ path: "/noop", method: "POST" }),
      optimistic: (input) => (m) => (sameMessage(m, input) ? null : m),
    });

    options.onError(new Error("boom"), INPUT, await options.onMutate(INPUT));

    expect(qc.getQueryState(plainKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });
});

describe("re-reading after a success", () => {
  test("invalidates the lists and the message detail by default", async () => {
    const qc = seed(new QueryClient());
    qc.setQueryData(detailKey, { gmailMessageId: "msg-1" });

    optionsFor(qc, { request: () => ({ path: "/noop", method: "POST" }) }).onSuccess(
      { ok: true },
      INPUT,
    );

    expect(qc.getQueryState(plainKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  // A removal's optimistic write is the truth: refetching the lists while a
  // second delete is still in flight would briefly re-add the rows it removed.
  test("keeps the lists when the optimistic write is authoritative", () => {
    const qc = seed(new QueryClient());
    qc.setQueryData(detailKey, { gmailMessageId: "msg-1" });

    optionsFor(qc, {
      request: () => ({ path: "/noop", method: "POST" }),
      listsAreAuthoritative: true,
    }).onSuccess({ ok: true }, INPUT);

    expect(qc.getQueryState(plainKey)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  test("invalidates every message a batch names", () => {
    const qc = new QueryClient();
    qc.setQueryData(["message", "acc-1", "msg-1"], {});
    qc.setQueryData(["message", "acc-1", "msg-2"], {});

    messageMutationOptions<{ accountId: string; gmailMessageIds: string[] }, { ok: true }>(qc, {
      request: () => ({ path: "/noop", method: "POST" }),
    }).onSuccess({ ok: true }, { accountId: "acc-1", gmailMessageIds: ["msg-1", "msg-2"] });

    expect(qc.getQueryState(["message", "acc-1", "msg-1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["message", "acc-1", "msg-2"])?.isInvalidated).toBe(true);
  });

  test("invalidates whatever else the mutation says it touched", () => {
    const qc = new QueryClient();
    qc.setQueryData(["accounts", "acc-1", "labels"], []);

    optionsFor(qc, {
      request: () => ({ path: "/noop", method: "POST" }),
      alsoInvalidate: (input) => [["accounts", input.accountId, "labels"]],
    }).onSuccess({ ok: true }, INPUT);

    expect(qc.getQueryState(["accounts", "acc-1", "labels"])?.isInvalidated).toBe(true);
  });
});

describe("the request", () => {
  test("goes through the shared api client, so it carries the bearer token", async () => {
    const calls = stubFetch({ ok: true });

    const result = await optionsFor(new QueryClient(), {
      request: (input) => ({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/archive`,
        method: "POST",
      }),
    }).mutationFn(INPUT);

    expect(calls).toEqual([`POST ${API}/messages/acc-1/msg-1/archive`]);
    expect(result).toEqual({ ok: true });
  });
});
