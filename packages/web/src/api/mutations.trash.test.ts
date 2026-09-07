import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { trashMessageMutationOptions } from "./mutations";
import { listedMessage } from "./listedMessage.fixture";
import type { ListMessagesResponse, ListedMessage } from "./types";

// #92. The confirmation panel's "Delete message" used to `fetch()` a route that
// does not exist (`/api/accounts/:id/messages/:id`) with no bearer token, and
// navigated back whether or not it worked. It now shares the trash mutation
// every other delete on the page uses, so the request shape and the cache
// writes are pinned here — at the options seam, which is where a mutation's
// contract lives (same trick as `schedule.hooks.test.ts`).

// #131. The choreography behind these writes moved into
// `messageMutationOptions`; what is asserted here is unchanged, since the
// mutation this page depends on has to keep behaving the same way.

// Stubs `fetch` rather than mocking `./client`, for the reason
// `filters.hooks.test.ts` gives: a module mock of the api client is
// process-global and bleeds into sibling suites, and the real client also
// proves the URL the route actually receives.
const originalFetch = globalThis.fetch;

interface Captured {
  url: string;
  method: string | undefined;
}

function stubFetch(body: unknown): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const INPUT = { accountId: "acc-1", gmailMessageId: "msg-1" };

const list = (items: ListedMessage[]): ListMessagesResponse => ({
  items,
  nextCursor: null,
});

const messageKey = ["message", "acc-1", "msg-1"];

// `apiFetch` resolves the path-only base against the window's origin, and the
// origin is the DOM harness's (#129) rather than one this file builds.
const API = `${window.location.origin}/api`;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("trashMessageMutationOptions", () => {
  test("DELETEs the message through the shared api client", async () => {
    const calls = stubFetch({ ok: true, threadId: "th-1" });

    const result = await trashMessageMutationOptions(new QueryClient()).mutationFn(INPUT);

    expect(calls).toEqual([{ url: `${API}/messages/acc-1/msg-1`, method: "DELETE" }]);
    expect(result).toEqual({ ok: true, threadId: "th-1" });
  });

  test("drops the message from the inbox lists before the request settles", async () => {
    const qc = new QueryClient();
    qc.setQueryData(
      ["messages", { accountId: "acc-1" }],
      list([
        listedMessage({ gmailMessageId: "msg-1" }),
        listedMessage({ gmailMessageId: "msg-2", gmailThreadId: "th-2" }),
      ]),
    );

    await trashMessageMutationOptions(qc).onMutate(INPUT);

    const cached = qc.getQueryData<ListMessagesResponse>(["messages", { accountId: "acc-1" }]);
    expect(cached?.items.map((m) => m.gmailMessageId)).toEqual(["msg-2"]);
  });

  test("invalidates the detail query on success so a stale message can't be read back", async () => {
    const qc = new QueryClient();
    qc.setQueryData(messageKey, { gmailMessageId: "msg-1", isTrashed: false });

    trashMessageMutationOptions(qc).onSuccess({ ok: true as const, threadId: "th-1" }, INPUT);

    expect(qc.getQueryState(messageKey)?.isInvalidated).toBe(true);
  });

  test("re-syncs the lists and the message from the server when the delete failed", () => {
    const qc = new QueryClient();
    qc.setQueryData(["messages", { accountId: "acc-1" }], list([listedMessage({})]));
    qc.setQueryData(messageKey, { gmailMessageId: "msg-1" });

    trashMessageMutationOptions(qc).onError(new Error("boom"), INPUT, undefined);

    expect(qc.getQueryState(["messages", { accountId: "acc-1" }])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(messageKey)?.isInvalidated).toBe(true);
  });
});
