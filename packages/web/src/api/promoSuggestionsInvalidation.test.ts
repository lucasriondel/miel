// A suggestion follows its mail (#160). The section's rule is that a promo whose
// message has been archived, trashed or removed is not shown — saving is what
// makes a promo outlive its mail — and the server enforces it on every read. On
// screen the rule is only as true as the cache, so the three actions that take a
// mail out of the inbox mark the suggestions stale as well as the lists.
//
// Asserted at the options seam, where a mutation's contract lives: the message
// lists are authoritative after a removal and are deliberately *not* re-read,
// so a promo query riding on that invalidation would never be refreshed at all.
import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  archiveMessageMutationOptions,
  batchMessageActionMutationOptions,
  savePromoMutationOptions,
  trashMessageMutationOptions,
  setMessageReadMutationOptions,
} from "./mutations";
import { queryKeys } from "./queries";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const INPUT = { accountId: "acc-1", gmailMessageId: "msg-1" };
const SUGGESTIONS = queryKeys.promoSuggestions({ accountId: "acc-1" });

/** A client with the suggestions already answered, so "stale" is a change. */
const seeded = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(SUGGESTIONS, { items: [] });
  return qc;
};

const isStale = (qc: QueryClient) => qc.getQueryState(SUGGESTIONS)?.isInvalidated === true;

describe("the suggestions are re-read when a mail leaves the inbox", () => {
  test("trashing one", () => {
    const qc = seeded();
    trashMessageMutationOptions(qc).onSuccess({ ok: true, threadId: "th-1" }, INPUT);
    expect(isStale(qc)).toBe(true);
  });

  test("archiving one", () => {
    const qc = seeded();
    archiveMessageMutationOptions(qc).onSuccess({ ok: true, threadId: "th-1" }, INPUT);
    expect(isStale(qc)).toBe(true);
  });

  test("a bulk removal", () => {
    const qc = seeded();
    batchMessageActionMutationOptions(qc).onSuccess(
      { ok: true, action: "trash", count: 2 },
      {
        accountId: "acc-1",
        gmailMessageIds: ["msg-1", "msg-2"],
        action: "trash",
      },
    );
    expect(isStale(qc)).toBe(true);
  });

  // A rolled-back removal has to put the card back too, and the rollback the
  // lists get is a snapshot the promo query has no equivalent of — so it is the
  // same re-read, on the failure path.
  test("and when the server refuses one, so the card comes back", () => {
    const qc = seeded();
    trashMessageMutationOptions(qc).onError(new Error("nope"), INPUT, undefined);
    expect(isStale(qc)).toBe(true);
  });

  // The save is the fourth way (#161), and the one that names both keys in the
  // same press: the promo it saved is no longer a suggestion, and the mail it
  // came from is no longer in the inbox.
  test("saving one", () => {
    const qc = seeded();
    savePromoMutationOptions(qc).onSuccess(
      { ok: true, id: "promo-1", trashedThreadId: "th-1" },
      { ...INPUT, promoId: "promo-1" },
    );
    expect(isStale(qc)).toBe(true);
  });

  // Reading a mail does not remove it, so nothing about the section changed.
  test("but not when a mail is merely marked read", () => {
    const qc = seeded();
    setMessageReadMutationOptions(qc).onSuccess({ ok: true, read: true }, { ...INPUT, read: true });
    expect(isStale(qc)).toBe(false);
  });
});
