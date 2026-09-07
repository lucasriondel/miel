// The save's own contract (#161), at the options seam — the two things a render
// cannot reach.
//
// The click, the removal and the refusal are exercised as a user meets them in
// `features/promos/promoSuggestionsWiring.test.tsx`. What is left here is the
// answer nobody can produce from the UI: a save that succeeded while the trash
// did not. The promo is kept — that is the whole point of the ordering — so the
// mail is still in the inbox, and the row the click removed has to come back.
import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { savePromoMutationOptions } from "./mutations";
import { queryKeys } from "./queries";
import type { SavePromoResult } from "./types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const INPUT = { accountId: "acc-1", gmailMessageId: "mail-1", promoId: "promo-1" };
const MESSAGES = ["messages"] as const;
const SUGGESTIONS = queryKeys.promoSuggestions({ accountId: "acc-1" });

/** Both caches answered, so "stale" is a change rather than an initial state. */
const seeded = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(SUGGESTIONS, { items: [] });
  qc.setQueryData(["messages", { accountId: "acc-1" }], { items: [], nextCursor: null });
  return qc;
};

const isStale = (qc: QueryClient, key: readonly unknown[]) =>
  qc
    .getQueryCache()
    .findAll({ queryKey: key })
    .some((q) => q.state.isInvalidated);

const answer = (over: Partial<SavePromoResult> = {}): SavePromoResult => ({
  ok: true,
  id: "promo-1",
  trashedThreadId: "th-1",
  ...over,
});

describe("savePromoMutationOptions", () => {
  test("POSTs the promo's own id to the save endpoint", async () => {
    const calls: { url: string; method?: string }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method });
      return new Response(JSON.stringify(answer()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await savePromoMutationOptions(new QueryClient()).mutationFn(INPUT);

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toEndWith("/promo-codes/promo-1/save");
    expect(calls[0]!.method).toBe("POST");
  });

  // The lists are authoritative after a removal, as they are for a trash: the
  // optimistic write is the truth, and re-reading them would race a second save
  // still in flight.
  test("re-reads the suggestions and leaves the lists alone when the mail was trashed", () => {
    const qc = seeded();

    savePromoMutationOptions(qc).onSuccess(answer(), INPUT);

    expect(isStale(qc, SUGGESTIONS)).toBe(true);
    expect(isStale(qc, MESSAGES)).toBe(false);
  });

  // …except here, where the optimistic write turned out not to be the truth.
  test("re-reads the lists when Gmail refused the trash, so the mail comes back", () => {
    const qc = seeded();

    savePromoMutationOptions(qc).onSuccess(answer({ trashedThreadId: null }), INPUT);

    expect(isStale(qc, MESSAGES)).toBe(true);
    // The promo is saved either way, so it is no longer a suggestion.
    expect(isStale(qc, SUGGESTIONS)).toBe(true);
  });

  test("puts the suggestions back when the save was refused", async () => {
    const qc = seeded();
    // A suggestion is dropped by the mail it hangs off, not by its own id: the
    // mail is going, so every promo detected in it goes with it.
    const promos = {
      items: [{ id: "promo-1", accountId: "acc-1", gmailMessageId: "mail-1" }],
    };
    qc.setQueryData(SUGGESTIONS, promos);

    const context = await savePromoMutationOptions(qc).onMutate(INPUT);
    expect(qc.getQueryData<{ items: unknown[] }>(SUGGESTIONS)).toEqual({ items: [] });

    savePromoMutationOptions(qc).onError(new Error("nope"), INPUT, context);

    expect(qc.getQueryData<{ items: unknown[] }>(SUGGESTIONS)).toEqual(promos);
  });
});
