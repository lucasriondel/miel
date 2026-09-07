// The three sources arriving as one list, rendered as a user meets it.
//
// This is the claim the merge is for and the one no source-reading test can
// make: a filter proposal, a verification code and an extracted promo — three
// endpoints, three shapes, three lifetimes — reach the screen as rows of a
// single ledger, in one container, in a fixed order. `fetch` is the seam, so
// each source really is read from its own endpoint.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LayoutContext } from "../../App";
import { listedMessage } from "../../api/listedMessage.fixture";
import type { ListedMessage, PromoSuggestion, SuggestedFilter } from "../../api/types";
import { TriageActivityProvider } from "../../contexts/TriageActivityContext";

// The real client, put back before the subjects load: a bun module mock is
// process-global and outlives the file that registered one.
const realClient = await import("../../api/client.ts?real");
mock.module("../../api/client", () => ({ ...realClient }));

const { queryKeys } = await import("../../api/queries");
const { InboxPage } = await import("../../pages/InboxPage");

const ACCOUNT = "acc-1";
const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2026-09-01T00:00:00.000Z");

/** A subject the code detector really fires on — the strip's own rule. */
const CODE_SUBJECT = "Your verification code is 482913";
const PLAIN_SUBJECT = "Weekend only: 20% off everything";

const MAILBOX: ListedMessage[] = [
  listedMessage({
    accountId: ACCOUNT,
    gmailMessageId: "mail-code",
    subject: CODE_SUBJECT,
    fromName: "GitHub",
    // Codes older than a day are dropped, so this one has to be recent.
    internalDate: new Date().toISOString(),
    priority: "high",
  }),
  listedMessage({
    accountId: ACCOUNT,
    gmailMessageId: "mail-promo",
    subject: PLAIN_SUBJECT,
    priority: "low",
  }),
];

const SUGGESTION: SuggestedFilter = {
  id: "f1",
  accountId: ACCOUNT,
  accountEmail: "me@example.com",
  criteriaFrom: "@northwind-labs.com",
  criteriaSubject: null,
  criteriaQuery: null,
  addLabelId: null,
  addLabelName: "Work",
  reasoning: "12 messages manually labeled Work this month",
  status: "pending",
  createdAt: new Date().toISOString(),
};

const PROMO: PromoSuggestion = {
  id: "p1",
  accountId: ACCOUNT,
  gmailMessageId: "mail-promo",
  code: "AUTUMN30",
  discount: "30% off everything",
  terms: "Full-price items only",
  expiresAt: "2026-12-24T23:59:59.999Z",
  merchant: "Uniqlo",
};

const originalFetch = globalThis.fetch;
/** Set by a test that needs a different mailbox than the shared one. */
let MAILBOX_OVERRIDE: ListedMessage[] | null = null;
const mailbox = () => MAILBOX_OVERRIDE ?? MAILBOX;
let urls: string[] = [];
let suggestions: SuggestedFilter[] = [];
let promos: PromoSuggestion[] = [];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  urls = [];
  suggestions = [];
  promos = [];
  MAILBOX_OVERRIDE = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/promo-codes")) {
      if (url.endsWith("/save") && init?.method === "POST") {
        const id = new URL(url).pathname.split("/").at(-2);
        promos = promos.filter((p) => p.id !== id);
        return json({ ok: true, id, trashedThreadId: "th-1" });
      }
      return json({ items: promos });
    }
    if (url.includes("/filters/suggestions/")) {
      const id = new URL(url).pathname.split("/").at(-2);
      suggestions = suggestions.filter((s) => s.id !== id);
      return json({ ok: true });
    }
    if (url.includes("/filters")) return json({ filters: [], suggestions });
    if (url.includes("/labels")) return json({ labels: [] });
    if (url.includes("/messages")) return json({ items: mailbox(), nextCursor: null });
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

const mountInbox = () => {
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
    { pages: [{ items: mailbox(), nextCursor: null }], pageParams: [undefined] },
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

const ledger = () => screen.queryByRole("region", { name: "Found in your mail" });
/**
 * A row is labelled by the kind that names it, so this is how a test asks for
 * "the filter row" without matching the word wherever else it appears.
 */
const rowsOfKind = (kind: string) =>
  screen.queryAllByRole("listitem", { name: new RegExp(`^${kind} — `) });
const shownLedger = async () => {
  await waitFor(() => expect(ledger() !== null).toBe(true));
  return ledger()!;
};

describe("the three sources as one list", () => {
  test("a filter, a code and a promo are rows of the same ledger", async () => {
    suggestions = [SUGGESTION];
    promos = [PROMO];
    mountInbox();

    const found = await shownLedger();
    // The three sources answer independently, so the last of them to land is
    // what the assertions below wait on.
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));

    // One row of each kind, in one list.
    expect(rowsOfKind("Filter")).toHaveLength(1);
    expect(rowsOfKind("Code")).toHaveLength(1);
    expect(rowsOfKind("Promo")).toHaveLength(1);

    // And the value each row was opened for.
    expect(within(found).queryByText("482913") !== null).toBe(true);
    expect(within(found).queryByText("AUTUMN30") !== null).toBe(true);
    // Twice, and deliberately: the pattern names the row in the issuer column
    // and is one half of the rule the value column spells out.
    expect(within(found).queryAllByText("@northwind-labs.com").length).toBeGreaterThan(0);
  });

  test("the header counts what is in it, by kind", async () => {
    suggestions = [SUGGESTION];
    promos = [PROMO];
    mountInbox();

    const found = await shownLedger();
    await waitFor(() =>
      expect(within(found).queryByText("3 items · 1 filter · 1 code · 1 promo") !== null).toBe(
        true,
      ),
    );
  });

  // Each source stands alone: the ledger is not a container for the promos
  // that the other two happen to join.
  test("a code alone is enough to draw the ledger", async () => {
    mountInbox();

    await shownLedger();
    expect(rowsOfKind("Code")).toHaveLength(1);
    expect(rowsOfKind("Promo")).toHaveLength(0);
    expect(rowsOfKind("Filter")).toHaveLength(0);
  });

  // Nothing to act on is the common case on a quiet inbox, and an
  // always-present section that is usually empty is permanent chrome tax on
  // the inbox — so there is no empty state and no heading left behind.
  test("renders nothing at all when every source is empty", async () => {
    // The coded mail is the one the detector fires on, so a mailbox without it
    // leaves all three sources with nothing to say.
    MAILBOX_OVERRIDE = [MAILBOX[1]!];
    mountInbox();

    await waitFor(() => expect(urls.some((u) => u.includes("/promo-codes"))).toBe(true));
    await waitFor(() => expect(screen.queryByText(PLAIN_SUBJECT) !== null).toBe(true));
    expect(ledger() === null).toBe(true);
  });

  test("is hidden in select mode, whatever it holds", async () => {
    suggestions = [SUGGESTION];
    promos = [PROMO];
    mountInbox();
    await shownLedger();

    fireEvent.click(screen.getByRole("button", { name: "Enter select mode" }));

    expect(ledger() === null).toBe(true);
  });
});

describe("acting on a row", () => {
  test("creating a filter asks the server and takes the row away", async () => {
    suggestions = [SUGGESTION];
    mountInbox();

    const found = await shownLedger();
    await waitFor(() => expect(rowsOfKind("Filter")).toHaveLength(1));

    fireEvent.click(within(found).getByRole("button", { name: "Create filter" }));

    await waitFor(() => expect(urls.some((u) => u.includes("/accept"))).toBe(true));
    expect(new URL(urls.find((u) => u.includes("/accept"))!).pathname).toEndWith(
      "/filters/suggestions/f1/accept",
    );
    // The filter row goes and the rest of the ledger stays: the code found in
    // the mailbox is a different source and nothing about accepting a filter
    // has anything to say about it.
    await waitFor(() => expect(rowsOfKind("Filter")).toHaveLength(0));
    expect(rowsOfKind("Code")).toHaveLength(1);
  });

  // Dismissing is the page's own act, not a write: there is no dismissed state
  // on a code, and inventing one would mean a request for "not now".
  test("dismissing a code drops the row without a request", async () => {
    mountInbox();

    const found = await shownLedger();
    await waitFor(() => expect(rowsOfKind("Code")).toHaveLength(1));
    const before = urls.length;

    fireEvent.click(within(found).getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(ledger() === null).toBe(true));
    expect(urls).toHaveLength(before);
  });
});
