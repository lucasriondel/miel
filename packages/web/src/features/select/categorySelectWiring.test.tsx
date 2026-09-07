// Selecting a whole category, as a user does it (#146): from an inbox that is
// not in select mode, one press on a section header selects that category and
// nothing else, the bulk bar counts exactly those messages, and a bulk action
// sends exactly their ids.
//
// The page is mounted for real — the section headers, the selection hook and
// the bulk bar are three parts that have to agree, and a test of any one of them
// alone would pass with the page wired to the wrong one. What each header offers
// on its own is `components/categorySelect.test.tsx`.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LayoutContext } from "../../App";
import { listedMessage } from "../../api/listedMessage.fixture";
import type { ListedMessage, Priority } from "../../api/types";

interface Sent {
  path: string;
  method?: string;
  body: Record<string, unknown>;
}

const sent: Sent[] = [];

/**
 * The one seam stubbed: the api client, registered in the file body with the
 * subjects imported after it, for the reason `bulkLabelWiring.test.tsx` gives —
 * a bun module mock is process-global, so a suite that registers none gets
 * whichever one ran last, and this file is loaded after one that registers its
 * own. The mailboxes are seeded in the cache, so the batch endpoint is the only
 * thing this page should ask for; anything else fails rather than answering a
 * silent `{}`.
 */
mock.module("../../api/client", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: async (req: Sent) => {
    if (req.path !== "/messages/batch") throw new Error(`unexpected request: ${req.path}`);
    sent.push({ path: req.path, method: req.method, body: req.body });
    return { ok: true, action: req.body.action, count: 1 };
  },
}));

const { InboxPage } = await import("../../pages/InboxPage");
const { TriageActivityProvider } = await import("../../contexts/TriageActivityContext");
const { queryKeys } = await import("../../api/queries");

const ACCOUNT = "acc-1";

const message = (id: string, priority: Priority | null): ListedMessage =>
  listedMessage({ accountId: ACCOUNT, gmailMessageId: id, priority });

/** Two high, one medium, one untriaged — so "the category" is never "the inbox". */
const MAILBOX: ListedMessage[] = [
  message("high-1", "high"),
  message("high-2", "high"),
  message("med-1", "medium"),
  message("untriaged-1", null),
];

beforeEach(() => {
  sent.length = 0;
});

afterEach(() => {
  sent.length = 0;
});

// Every mode is a period now (#151), so the page always scopes its query to
// the layout's window and the seeded cache is keyed with the same one.
const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2026-09-01T00:00:00.000Z");

const layout = (selectedAccountId: string): LayoutContext => ({
  selectedAccountId,
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

const mountInbox = (items: ListedMessage[] = MAILBOX) => {
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
    { pages: [{ items, nextCursor: null }], pageParams: [undefined] },
  );
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/account/${ACCOUNT}`]}>
        <TriageActivityProvider>
          <Routes>
            <Route element={<Outlet context={layout(ACCOUNT)} />}>
              <Route path="/account/:accountId" element={<InboxPage />} />
            </Route>
          </Routes>
        </TriageActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const bulkBar = () => screen.queryByRole("region", { name: "Bulk actions" });
const selectedCount = () => bulkBar()?.textContent?.match(/(\d+) selected/)?.[1];
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("selecting a whole category from the inbox", () => {
  test("one press enters select mode and selects that category alone", () => {
    mountInbox();
    expect(bulkBar()).toBeNull();

    press("Select all high priority messages");

    // Select mode was off: entering it is part of the gesture, not something to
    // go and do in the top bar first.
    expect(selectedCount()).toBe("2");
    // The other categories are untouched — theirs still offer to select.
    expect(
      screen.getByRole("button", { name: "Select all medium priority messages" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select all untriaged messages" })).toBeTruthy();
  });

  test("pressing it again clears that category", () => {
    mountInbox();

    press("Select all high priority messages");
    press("Clear high priority selection");

    // Still in select mode with nothing selected — the press said "not these",
    // not "never mind".
    expect(selectedCount()).toBe("0");
    expect(screen.getByRole("button", { name: "Select all high priority messages" })).toBeTruthy();
  });

  test("two categories add up, and the second clears on its own", () => {
    mountInbox();

    press("Select all high priority messages");
    press("Select all untriaged messages");
    expect(selectedCount()).toBe("3");

    press("Clear untriaged selection");

    expect(selectedCount()).toBe("2");
    expect(screen.getByRole("button", { name: "Clear high priority selection" })).toBeTruthy();
  });

  test("the untriaged section has the same control", () => {
    mountInbox();

    press("Select all untriaged messages");

    expect(selectedCount()).toBe("1");
  });

  test("a bulk action applies to exactly the category's messages", async () => {
    mountInbox();

    press("Select all high priority messages");
    fireEvent.click(within(bulkBar()!).getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      path: "/messages/batch",
      method: "POST",
      body: { accountId: ACCOUNT, gmailMessageIds: ["high-1", "high-2"], action: "archive" },
    });
  });

  test("selecting every category is the whole inbox, and the bar says so", () => {
    mountInbox();

    for (const category of ["high priority", "medium priority", "untriaged"]) {
      press(`Select all ${category} messages`);
    }

    expect(selectedCount()).toBe("4");
    // Which is what the bar's own "Select all (4)" would have produced: it now
    // offers to clear instead.
    expect(within(bulkBar()!).getByRole("button", { name: "Clear" })).toBeTruthy();
  });
});
