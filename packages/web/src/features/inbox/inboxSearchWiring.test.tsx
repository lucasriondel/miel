// The inbox's search (⌘K) and the empty states it leads to, rendered: typing
// narrows the rows on screen, a query nothing matches says the search covers
// only the period and offers the two ways out, and clearing it brings the rows
// back. `fetch` is the one seam; every request the page has not been seeded for
// is refused, since the search itself must never reach the network.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LayoutContext } from "../../App";
import { listedMessage } from "../../api/listedMessage.fixture";
import { queryKeys } from "../../api/queries";
import { TriageActivityProvider } from "../../contexts/TriageActivityContext";
import { InboxPage } from "../../pages/InboxPage";

const ACCOUNT = "acc-1";
const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2026-09-01T00:00:00.000Z");

const MAILBOX = [
  listedMessage({
    accountId: ACCOUNT,
    gmailMessageId: "m-1",
    fromName: "Acme Billing",
    subject: "Invoice for August",
    priority: "high",
  }),
  listedMessage({
    accountId: ACCOUNT,
    gmailMessageId: "m-2",
    fromName: "Claire Martin",
    subject: "Dinner Saturday?",
    priority: "medium",
  }),
];

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    // The row promos and labels are read alongside the list; nothing else is.
    if (url.includes("/promo-codes")) return Response.json({ items: [] });
    if (url.includes("/labels")) return Response.json({ labels: [] });
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const layout = (setViewMode: () => void = () => {}): LayoutContext => ({
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
  setViewMode,
  selectedAccountEmail: "me@example.com",
  mailbox: "inbox",
});

const mount = (setViewMode?: () => void) => {
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
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/account/${ACCOUNT}`]}>
        <TriageActivityProvider>
          <Routes>
            <Route element={<Outlet context={layout(setViewMode)} />}>
              <Route path="/account/:accountId" element={<InboxPage />} />
            </Route>
          </Routes>
        </TriageActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const search = () => screen.getByRole("searchbox", { name: "Search mail" });

describe("searching the inbox", () => {
  test("narrows the rows on screen to the ones every word matches", async () => {
    mount();
    expect(screen.getByText("Invoice for August")).toBeDefined();
    expect(screen.getByText("Dinner Saturday?")).toBeDefined();

    fireEvent.change(search(), { target: { value: "acme august" } });

    // A row leaving plays its exit (250ms) before it unmounts.
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByText("Dinner Saturday?")).toBeNull();
    expect(screen.getByText("Invoice for August")).toBeDefined();
  });

  test("a query nothing matches says what was searched and offers the way out", () => {
    let widened = 0;
    mount(() => (widened += 1));

    fireEvent.change(search(), { target: { value: "acme invoice march" } });

    expect(
      screen.getByRole("heading", { name: "No mail matches “acme invoice march”" }),
    ).toBeDefined();
    expect(screen.getByText(/Search only covers this month/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Search this year" }));
    expect(widened).toBe(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    expect(screen.getByText("Dinner Saturday?")).toBeDefined();
  });

  test("Escape clears the field", () => {
    mount();
    fireEvent.change(search(), { target: { value: "claire" } });
    fireEvent.keyDown(search(), { key: "Escape" });
    expect((search() as HTMLInputElement).value).toBe("");
  });
});
