// The sources arriving as one list, rendered as a user meets it.
//
// The claim no source-reading test can make: a verification code found in the
// mailbox reaches the screen as a row of the ledger, in one container. An
// extracted promo is answered too, to show it is no longer one of them: it sits
// on its message's row instead. `fetch` is the seam, so each source really is
// read from its own endpoint.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LayoutContext } from "../../App";
import { listedMessage } from "../../api/listedMessage.fixture";
import type { ListedMessage, PromoSuggestion } from "../../api/types";
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

const PROMO: PromoSuggestion = {
  id: "p1",
  accountId: ACCOUNT,
  gmailMessageId: "mail-promo",
  code: "AUTUMN30",
  discount: "30% off everything",
  terms: "Full-price items only",
  expiresAt: "2026-12-24T23:59:59.999Z",
  merchant: "Uniqlo",
  subject: "Autumn sale",
  fromName: "Uniqlo",
  fromEmail: "news@uniqlo.example",
  internalDate: "2026-09-01T09:00:00.000Z",
};

const originalFetch = globalThis.fetch;
/** Set by a test that needs a different mailbox than the shared one. */
let MAILBOX_OVERRIDE: ListedMessage[] | null = null;
const mailbox = () => MAILBOX_OVERRIDE ?? MAILBOX;
let urls: string[] = [];
let promos: PromoSuggestion[] = [];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  urls = [];
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
    if (url.includes("/filters")) return json({ filters: [] });
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
 * "the code row" without matching the word wherever else it appears.
 */
const rowsOfKind = (kind: string) =>
  screen.queryAllByRole("listitem", { name: new RegExp(`^${kind} — `) });
const shownLedger = async () => {
  await waitFor(() => expect(ledger() !== null).toBe(true));
  return ledger()!;
};

describe("the ledger", () => {
  test("a code is a row of the ledger, and a promo is not", async () => {
    promos = [PROMO];
    mountInbox();

    const found = await shownLedger();
    // The sources answer independently, so the last of them to land is what
    // the assertions below wait on — the promo, on its message's row.
    await waitFor(() => expect(screen.queryByText("AUTUMN30") !== null).toBe(true));
    await waitFor(() => expect(within(found).getAllByRole("listitem")).toHaveLength(1));

    expect(rowsOfKind("Code")).toHaveLength(1);
    expect(within(found).queryByText("482913") !== null).toBe(true);
    expect(within(found).queryByText("AUTUMN30") === null).toBe(true);
  });

  test("the header counts what is in it", async () => {
    mountInbox();

    const found = await shownLedger();
    await waitFor(() => expect(within(found).queryByText("1 item · 1 code") !== null).toBe(true));
  });

  // Nothing to act on is the common case on a quiet inbox, and an
  // always-present section that is usually empty is permanent chrome tax on
  // the inbox — so there is no empty state and no heading left behind.
  test("renders nothing at all when every source is empty", async () => {
    // The coded mail is the one the detector fires on, so a mailbox without it
    // leaves every source with nothing to say.
    MAILBOX_OVERRIDE = [MAILBOX[1]!];
    mountInbox();

    await waitFor(() => expect(urls.some((u) => u.includes("/promo-codes"))).toBe(true));
    await waitFor(() => expect(screen.queryByText(PLAIN_SUBJECT) !== null).toBe(true));
    expect(ledger() === null).toBe(true);
  });

  test("is hidden in select mode, whatever it holds", async () => {
    mountInbox();
    await shownLedger();

    fireEvent.click(screen.getByRole("button", { name: "Enter select mode" }));

    expect(ledger() === null).toBe(true);
  });
});

describe("acting on a row", () => {
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
