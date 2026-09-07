import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { deleteFilterMutationOptions, mergeFiltersMutationOptions } from "./filters.hooks";

// Stubs `fetch` rather than mocking `./client`: a module mock of the shared api
// client is process-global and bleeds into sibling suites, and going through the
// real `apiFetch` also proves the URL the route actually receives.
const originalFetch = globalThis.fetch;

interface Captured {
  url: string;
  method: string | undefined;
  body: unknown;
}

function stubFetch(body: unknown = { filter: {} }, status = 200): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

describe("deleteFilterMutationOptions", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("DELETEs the filter id, scoped by account", async () => {
    const calls = stubFetch({ filter: { gmailFilterId: "f-1" } });
    const opts = deleteFilterMutationOptions(new QueryClient());

    const result = await opts.mutationFn({
      accountId: "acct-1",
      gmailFilterId: "f-1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toContain("/filters/f-1");
    expect(calls[0]!.url).toContain("accountId=acct-1");
    expect(result.filter.gmailFilterId).toBe("f-1");
  });

  test("percent-encodes a filter id that is not URL-safe", async () => {
    const calls = stubFetch();
    const opts = deleteFilterMutationOptions(new QueryClient());

    await opts.mutationFn({ accountId: "acct-1", gmailFilterId: "a/b c" });

    expect(calls[0]!.url).toContain("/filters/a%2Fb%20c");
  });

  test("onSuccess invalidates every filters query so the list refetches", async () => {
    const qc = new QueryClient();
    const invalidated: unknown[] = [];
    qc.invalidateQueries = ((filters: unknown) => {
      invalidated.push(filters);
      return Promise.resolve();
    }) as QueryClient["invalidateQueries"];

    await deleteFilterMutationOptions(qc).onSuccess();

    expect(invalidated).toEqual([{ queryKey: ["filters"] }]);
  });
});

describe("mergeFiltersMutationOptions", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("POSTs the account and the selected filter ids to /filters/merge", async () => {
    const calls = stubFetch({
      filter: { gmailFilterId: "merged-1" },
      deletedGmailFilterIds: ["f-1", "f-2"],
      failedDeletions: [],
    });

    const result = await mergeFiltersMutationOptions(new QueryClient()).mutationFn({
      accountId: "acct-1",
      gmailFilterIds: ["f-1", "f-2"],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toContain("/filters/merge");
    expect(calls[0]!.body).toEqual({
      accountId: "acct-1",
      gmailFilterIds: ["f-1", "f-2"],
    });
    expect(result.filter.gmailFilterId).toBe("merged-1");
    expect(result.deletedGmailFilterIds).toEqual(["f-1", "f-2"]);
  });

  test("a rejected merge throws, so the caller keeps the selection", async () => {
    // The endpoint answers 400 with the reason; nothing was mutated, so the
    // page must surface it and leave the user's selection alone to retry.
    stubFetch(
      {
        error: "filter_merge_failed",
        message: "These filters disagree about L1.",
        reason: "unmergeable",
      },
      400,
    );

    const merge = mergeFiltersMutationOptions(new QueryClient()).mutationFn({
      accountId: "acct-1",
      gmailFilterIds: ["f-1", "f-2"],
    });

    await expect(merge).rejects.toThrow();
  });

  test("onSuccess invalidates every filters query so the merged row appears", async () => {
    const qc = new QueryClient();
    const invalidated: unknown[] = [];
    qc.invalidateQueries = ((filters: unknown) => {
      invalidated.push(filters);
      return Promise.resolve();
    }) as QueryClient["invalidateQueries"];

    await mergeFiltersMutationOptions(qc).onSuccess();

    expect(invalidated).toEqual([{ queryKey: ["filters"] }]);
  });
});
