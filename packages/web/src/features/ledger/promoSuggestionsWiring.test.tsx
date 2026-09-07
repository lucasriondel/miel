// The promo suggestions above the inbox list (#160) and the save on each row
// (#161), rendered as a user meets them: the page is mounted for real, the
// message list is seeded in the cache, and the requests that leave are the
// ledger's own — its reads, and the save a click sends.
//
// The promos are rows in the actionables ledger now rather than a section of
// cards of their own, so the ledger is what is mounted and the locators are
// the row's. What is asserted did not change with the shape: the request the
// period builds, the fields a promo shows, where it sits relative to the list,
// and that the row and the mail leave together on a save and come back on a
// refusal.
//
// `fetch` is the seam rather than the api client, so the URL the section builds
// is part of what is asserted — the period scoping is a claim about the request,
// and a stubbed client would let a section that filtered client-side pass. Any
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
 * the subjects of the seeded mailbox, and a subject that tripped it would put a
 * second row in the ledger and make the row counts here about two features.
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
    // The ledger's other two sources. Empty, so every row on screen is a promo
    // and the counts below are about this feature alone — but answered rather
    // than refused, because the ledger really does read them.
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

const section = () => screen.queryByRole("region", { name: "Found in your mail" });
/**
 * A promo row is identified by the act only it has. The ledger's rows are not
 * landmarks — they are rows of one list — so the save button is what counts
 * them, and counting the buttons counts the rows.
 */
const rows = () => screen.queryAllByRole("button", { name: SAVE_LABEL });
const shownSection = async () => {
  await waitFor(() => expect(section()).not.toBeNull());
  return section()!;
};

describe("the suggestions section", () => {
  // No empty state: an always-present section that is usually empty is
  // permanent chrome tax on the inbox.
  test("renders nothing at all when the endpoint answers empty", async () => {
    mountInbox([]);

    await waitFor(() => expect(urls).toHaveLength(1));
    expect(section()).toBeNull();
    expect(rows()).toHaveLength(0);
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

  test("shows one row per suggestion the server answered with", async () => {
    mountInbox([promo(), promo({ id: "promo-2", code: "SUMMER10", merchant: "Uniqlo" })]);

    await shownSection();
    expect(rows()).toHaveLength(2);
  });
});

describe("what a promo row carries", () => {
  test("the discount, the terms, the merchant, the expiry and the code", async () => {
    mountInbox([promo()]);

    const found = await shownSection();
    expect(within(found).getByText("WEEKEND20")).not.toBeNull();
    expect(within(found).getByText("Zara")).not.toBeNull();
    expect(within(found).getByText("20% off")).not.toBeNull();
    // Discount and terms share the context cell, so they are read together.
    expect(within(found).getByText(/orders over £50, excl\. sale/)).not.toBeNull();
    // The deadline column is a bare date — the ledger's right column is always
    // the deadline, so a cell repeating the word would say it twice.
    expect(within(found).getByText(/24/)).not.toBeNull();
  });

  // The offer that needs no code, and the mail that named no deadline: neither
  // may be shown something the mail never said.
  test("states no code needed rather than an empty chip, and guesses no date", async () => {
    mountInbox([promo({ code: null, expiresAt: null, terms: null })]);

    const found = await shownSection();
    // The chip stays and says so: vanishing would leave the value column empty
    // and the row misaligned against the ones above it.
    expect(within(found).getByText("No code needed")).not.toBeNull();
    expect(within(found).queryByText("WEEKEND20")).toBeNull();
    // And the copy act is offered but refused, rather than quietly missing.
    expect(
      within(found).getByRole("button", { name: "No code to copy" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  test("falls back to the sender-less case without an empty merchant cell", async () => {
    mountInbox([promo({ merchant: null })]);

    const found = await shownSection();
    expect(within(found).queryByText("Zara")).toBeNull();
    expect(within(found).getByText("20% off")).not.toBeNull();
  });
});

describe("where the ledger sits", () => {
  test("above the message list", async () => {
    mountInbox([promo()]);

    const found = await shownSection();
    const firstMessage = screen.getAllByRole("link")[0]!;
    // DOCUMENT_POSITION_FOLLOWING: the list comes after the section.
    expect(found.compareDocumentPosition(firstMessage) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  // Rows, stacked, in one container: what the cards bought with a sideways
  // scroll the ledger gets from a row costing one line each. Several promos
  // must not push the first message off the screen.
  test("stacks the suggestions as rows in a single container", async () => {
    mountInbox([promo(), promo({ id: "promo-2" })]);

    const found = await shownSection();
    expect(rows()).toHaveLength(2);
    // Both rows are inside the one ledger, rather than each being its own
    // section the way the three replaced components were.
    for (const row of rows()) expect(found.contains(row)).toBe(true);
  });

  // The bulk-action mode stays uncluttered: every act in the ledger is a
  // single-item act with nothing to say about a selection.
  test("is hidden in select mode", async () => {
    mountInbox([promo()]);
    await shownSection();

    fireEvent.click(screen.getByRole("button", { name: "Enter select mode" }));

    expect(section()).toBeNull();
  });
});

// One act does the whole thing (#161): the promo is saved with a copy of its
// mail and the Gmail original is trashed, in that order, server-side. What the
// screen owes the user is that the ledger row and the message row leave
// together the moment they click — the interface should not wait on the network
// to tell it what it already knows — and that both come back if it is refused.
describe("saving a promo from its row", () => {
  const saveButton = async () => {
    await shownSection();
    return rows()[0]!;
  };

  const messageRow = () => screen.queryByText(SUBJECT);

  test("asks the server to save that promo, and no other", async () => {
    mountInbox([promo(), promo({ id: "promo-2", code: "SUMMER10" })]);

    fireEvent.click(await saveButton());

    await waitFor(() => expect(urls.some((u) => u.includes("/save"))).toBe(true));
    const url = new URL(urls.find((u) => u.includes("/save"))!);
    expect(url.pathname).toEndWith("/promo-codes/promo-1/save");
  });

  test("removes the ledger row and the message row together, before the network answers", async () => {
    mountInbox([promo()]);
    expect(messageRow()).not.toBeNull();

    let answered!: () => void;
    holdSave = new Promise<void>((resolve) => {
      answered = resolve;
    });

    fireEvent.click(await saveButton());

    // The server has said nothing yet, and both are already gone.
    await waitFor(() => expect(section()).toBeNull());
    expect(messageRow()).toBeNull();
    answered();
  });

  // A failure is visible rather than silently swallowed: the promo was not
  // saved, so the mail is still in the inbox and the row is still an offer.
  test("puts both back when the save is refused", async () => {
    saveRefused = true;
    mountInbox([promo()]);

    let refused!: () => void;
    holdSave = new Promise<void>((resolve) => {
      refused = resolve;
    });

    fireEvent.click(await saveButton());
    // Gone on the click, as they would be for a save that succeeds…
    await waitFor(() => expect(section()).toBeNull());
    expect(messageRow()).toBeNull();

    refused();

    // …and back, both of them, once the server has said no.
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(messageRow()).not.toBeNull();
  });

  // The suggestions are a separate query from the lists, so nothing about a
  // removal reaches them on their own — which is why the save names both.
  test("leaves the row gone once the server has answered", async () => {
    mountInbox([promo()]);

    fireEvent.click(await saveButton());

    await waitFor(() => expect(urls.some((u) => u.includes("/save"))).toBe(true));
    // The re-read the save triggers answers without the promo it just saved.
    await waitFor(() => expect(urls.filter((u) => !u.includes("/save"))).toHaveLength(2));
    expect(section()).toBeNull();
  });
});
