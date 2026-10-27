// The promo suggestions on their inbox rows and the save on each (#161),
// rendered as a user meets them: the page is mounted for real, the message list
// is seeded in the cache, and the requests that leave are the page's own — the
// suggestions read, and the save a click sends.
//
// The promos used to be rows of the actionables ledger above the list. They sit
// on the second line of the message they were found in now, beside its
// attachments, with a single icon to save. What is asserted did not change with
// the move: the request the period builds, what a promo shows, where it sits,
// and that the promo and the mail leave together on a save and come back on a
// refusal.
//
// `fetch` is the seam rather than the api client, so the URL the page builds is
// part of what is asserted — the period scoping is a claim about the request,
// and a stubbed client would let a page that filtered client-side pass. Any
// request the suite has not seeded is refused, so a query escaping the cache
// fails loudly instead of answering a silent `{}`.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LayoutContext } from "../../App";
import { listedMessage } from "../../api/listedMessage.fixture";
import type { ListedMessage, PromoSuggestion } from "../../api/types";
import { TriageActivityProvider } from "../../contexts/TriageActivityContext";

/**
 * The real api client, put back before the subjects are imported.
 *
 * A bun module mock is process-global and outlives the file that registered
 * one, so a suite whose seam is `fetch` inherits whichever client stub ran last
 * — and this suite's claim is precisely that the *real* client builds the URL
 * the server is asked for. `?real` resolves to the same source under a
 * specifier no mock is registered against, which is how the genuine module is
 * reachable at all once another file has replaced it.
 */
const realClient = await import("../../api/client.ts?real");
// Spread rather than handed over whole: a module namespace object is exotic and
// registers as no replacement at all.
mock.module("../../api/client", () => ({ ...realClient }));

const { queryKeys } = await import("../../api/queries");
const { InboxPage } = await import("../../pages/InboxPage");

const ACCOUNT = "acc-1";
const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2026-09-01T00:00:00.000Z");

const promo = (over: Partial<PromoSuggestion> = {}): PromoSuggestion => ({
  id: "promo-1",
  accountId: ACCOUNT,
  gmailMessageId: "mail-1",
  code: "WEEKEND20",
  discount: "20% off",
  terms: "orders over £50, excl. sale",
  expiresAt: "2026-12-24T23:59:59.999Z",
  merchant: "Zara",
  ...over,
});

/**
 * Deliberately carries no verification code: `collectVerificationCodes` reads
 * the subjects of the seeded mailbox, and a subject that tripped it would draw
 * the ledger and put a second feature on screen.
 */
const SUBJECT = "Weekend only: 20% off everything";
/** The save, which still says what both halves of the press do — in its label. */
const SAVE_LABEL = "Save promo & delete message";

const MAILBOX: ListedMessage[] = [
  listedMessage({
    accountId: ACCOUNT,
    gmailMessageId: "mail-1",
    subject: SUBJECT,
    priority: "high",
  }),
];

const originalFetch = globalThis.fetch;
let urls: string[] = [];
let answer: PromoSuggestion[] = [];
/** Set to make the save endpoint refuse, the way a server that cannot save does. */
let saveRefused = false;
/** Held open by the tests that are about what the screen does *before* an answer. */
let holdSave: Promise<void> | null = null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  urls = [];
  answer = [];
  saveRefused = false;
  holdSave = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes("/promo-codes")) {
      urls.push(url);
      // The save, which the server answers by taking the promo out of the
      // suggestions — a saved promo is never suggested again.
      if (url.endsWith("/save") && init?.method === "POST") {
        if (holdSave) await holdSave;
        if (saveRefused) return json({ error: "promo_not_found" }, 500);
        const id = new URL(url).pathname.split("/").at(-2);
        answer = answer.filter((p) => p.id !== id);
        return json({ ok: true, id, trashedThreadId: "th-1" });
      }
      return json({ items: answer });
    }
    // The rollback's re-read: the mail the list put back is still there.
    if (url.includes("/messages")) return json({ items: MAILBOX, nextCursor: null });
    // The ledger's sources. Empty, so nothing on screen but the rows is about
    // this feature — but answered rather than refused, because the ledger
    // really does read them.
    if (url.includes("/filters")) return json({ filters: [], suggestions: [] });
    if (url.includes("/labels")) return json({ labels: [] });
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const layout = (): LayoutContext => ({
  selectedAccountId: ACCOUNT,
  selectedLabelId: undefined,
  rangeStartIso: RANGE_START.toISOString(),
  rangeEndIso: RANGE_END.toISOString(),
  range: { start: RANGE_START, end: RANGE_END, key: "2026-08-01", mode: "month" },
  isCurrentPeriod: true,
  canGoNext: false,
  goPrev: () => {},
  goNext: () => {},
  goToday: () => {},
  setViewMode: () => {},
  selectedAccountEmail: undefined,
});

const mountInbox = (suggestions: PromoSuggestion[]) => {
  answer = suggestions;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(
    queryKeys.messages({
      accountId: ACCOUNT,
      labelId: undefined,
      internalDateFrom: RANGE_START.toISOString(),
      internalDateTo: RANGE_END.toISOString(),
    }),
    { pages: [{ items: MAILBOX, nextCursor: null }], pageParams: [undefined] },
  );
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/account/${ACCOUNT}`]}>
        <TriageActivityProvider>
          <Routes>
            <Route element={<Outlet context={layout()} />}>
              <Route path="/account/:accountId" element={<InboxPage />} />
            </Route>
          </Routes>
        </TriageActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

/** The ledger, which promos are no longer part of. */
const ledger = () => screen.queryByRole("region", { name: "Found in your mail" });
/** A promo is identified by the act only it has, so counting saves counts promos. */
const saves = () => screen.queryAllByRole("button", { name: SAVE_LABEL });
const messageRow = () => screen.queryByText(SUBJECT)?.closest<HTMLElement>(".message-row") ?? null;
const shownPromos = async () => {
  await waitFor(() => expect(saves().length).toBeGreaterThan(0));
  return messageRow()!;
};

describe("the suggestions read", () => {
  test("draws no promo when the endpoint answers empty", async () => {
    mountInbox([]);

    await waitFor(() => expect(urls).toHaveLength(1));
    expect(saves()).toHaveLength(0);
    expect(ledger()).toBeNull();
  });

  test("asks the server for the account and the period the list is showing", async () => {
    mountInbox([promo()]);

    await waitFor(() => expect(urls).toHaveLength(1));
    const url = new URL(urls[0]!);
    expect(url.pathname).toEndWith("/promo-codes");
    expect(url.searchParams.get("account")).toBe(ACCOUNT);
    expect(url.searchParams.get("internalDateFrom")).toBe(RANGE_START.toISOString());
    expect(url.searchParams.get("internalDateTo")).toBe(RANGE_END.toISOString());
  });

  test("shows one promo per suggestion the server answered with", async () => {
    mountInbox([promo(), promo({ id: "promo-2", code: "SUMMER10", merchant: "Uniqlo" })]);

    await shownPromos();
    expect(saves()).toHaveLength(2);
  });

  // A suggestion whose mail is not on screen has no row to sit on.
  test("draws nothing for a promo whose mail is not in the list", async () => {
    mountInbox([promo({ gmailMessageId: "elsewhere" })]);

    await waitFor(() => expect(urls).toHaveLength(1));
    await waitFor(() => expect(messageRow()).not.toBeNull());
    expect(saves()).toHaveLength(0);
  });
});

describe("where a promo sits", () => {
  test("on the row of the mail it was found in, not in the ledger", async () => {
    mountInbox([promo()]);

    const row = await shownPromos();
    expect(row.contains(saves()[0]!)).toBe(true);
    expect(ledger()).toBeNull();
  });
});

describe("what a promo carries", () => {
  test("the code and the discount, with the shop and the terms in its title", async () => {
    mountInbox([promo()]);

    const row = await shownPromos();
    expect(within(row).getByText("WEEKEND20")).not.toBeNull();
    expect(within(row).getByText("20% off")).not.toBeNull();
    expect(within(row).getByTitle("Zara · 20% off · orders over £50, excl. sale")).not.toBeNull();
  });

  // The one act is the save, as an icon: nothing else is offered.
  test("offers only the save", async () => {
    mountInbox([promo()]);

    const row = await shownPromos();
    expect(within(row).queryByRole("button", { name: /copy|dismiss/i })).toBeNull();
  });

  // A detection written before #166 stopped storing code-less promos: still
  // drawn, with the discount and no code invented for it (#168).
  test("draws a row with no code by its discount alone", async () => {
    mountInbox([promo({ code: null, terms: null })]);

    const row = await shownPromos();
    expect(within(row).queryByText("WEEKEND20")).toBeNull();
    expect(within(row).getByText("20% off")).not.toBeNull();
  });
});

// One act does the whole thing (#161): the promo is saved with a copy of its
// mail and the Gmail original is trashed, in that order, server-side. What the
// screen owes the user is that the row and its promo leave together the moment
// they click, and come back if it is refused.
describe("saving a promo from its row", () => {
  test("asks the server to save that promo, and no other", async () => {
    mountInbox([promo(), promo({ id: "promo-2", code: "SUMMER10" })]);

    await shownPromos();
    fireEvent.click(saves()[0]!);

    await waitFor(() => expect(urls.some((u) => u.includes("/save"))).toBe(true));
    const url = new URL(urls.find((u) => u.includes("/save"))!);
    expect(url.pathname).toEndWith("/promo-codes/promo-1/save");
  });

  test("removes the message row and its promo before the network answers", async () => {
    mountInbox([promo()]);
    await shownPromos();

    let answered!: () => void;
    holdSave = new Promise<void>((resolve) => {
      answered = resolve;
    });

    fireEvent.click(saves()[0]!);

    // The server has said nothing yet, and both are already gone.
    await waitFor(() => expect(messageRow()).toBeNull());
    expect(saves()).toHaveLength(0);
    answered();
  });

  // A failure is visible rather than silently swallowed: the promo was not
  // saved, so the mail is still in the inbox and its promo still an offer.
  test("puts both back when the save is refused", async () => {
    saveRefused = true;
    mountInbox([promo()]);
    await shownPromos();

    let refused!: () => void;
    holdSave = new Promise<void>((resolve) => {
      refused = resolve;
    });

    fireEvent.click(saves()[0]!);
    await waitFor(() => expect(messageRow()).toBeNull());

    refused();

    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(messageRow()).not.toBeNull();
  });

  // The suggestions are a separate query from the lists, so nothing about a
  // removal reaches them on their own — which is why the save names both.
  test("leaves the promo gone once the server has answered", async () => {
    mountInbox([promo()]);
    await shownPromos();

    fireEvent.click(saves()[0]!);

    await waitFor(() => expect(urls.some((u) => u.includes("/save"))).toBe(true));
    // The re-read the save triggers answers without the promo it just saved.
    await waitFor(() => expect(urls.filter((u) => !u.includes("/save"))).toHaveLength(2));
    expect(saves()).toHaveLength(0);
  });
});
