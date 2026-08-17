// The section header enters and leaves with the account (#137).
//
// Switching accounts is a route-param change, not a remount: the two section
// components stay mounted and their rows animate out and back in underneath a
// header that used to hard-cut to the new account's count. Both headers are
// under the rows' own presence machinery now, keyed on the account.
//
// Rendered rather than read as source: what matters is that the outgoing header
// is still on screen — with the count it left with — for the length of the exit
// and gone after it. A regex over the component would assert a class name,
// which breaks on a rename and passes on a header wired to the wrong key.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LayoutContext } from "../App";
import { listedMessage } from "../api/listedMessage.fixture";
import { queryKeys } from "../api/queries";
import type { ListedMessage } from "../api/types";
import { TriageActivityProvider } from "../contexts/TriageActivityContext";
import { InboxPage } from "../pages/InboxPage";
import { PrioritySection } from "./PrioritySection";
import { UntriagedSection } from "./UntriagedSection";

// Nothing here presses a button that mutates, so any request is a mistake.
const originalFetch = globalThis.fetch;

const device = (
  globalThis as unknown as {
    happyDOM: { settings: { device: { prefersReducedMotion: string } } };
  }
).happyDOM.settings.device;

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    throw new Error(`unexpected request: ${String(input)}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  device.prefersReducedMotion = "no-preference";
});

const messagesFor = (accountId: string, count: number): ListedMessage[] =>
  Array.from({ length: count }, (_, i) =>
    listedMessage({ accountId, gmailMessageId: `${accountId}-msg-${i}`, priority: "high" }),
  );

interface SectionCase {
  name: string;
  /** The `<h2>` both accounts' headers carry — the section's title never changes. */
  title: string;
  element: (accountId: string, messages: ListedMessage[]) => ReactElement;
}

const CASES: SectionCase[] = [
  {
    name: "PrioritySection",
    title: "High priority",
    element: (accountId, messages) => (
      <PrioritySection accountId={accountId} priority="high" messages={messages} />
    ),
  },
  {
    name: "UntriagedSection",
    title: "Not yet triaged",
    element: (accountId, messages) => (
      <UntriagedSection accountId={accountId} messages={messages} />
    ),
  },
];

/** Mounts one section and hands back the account switch as a prop change,
 *  which is what `navigate('/account/:id')` is to a mounted InboxPage. */
const mountSection = (section: SectionCase, accountId: string, messages: ListedMessage[]) => {
  const tree = (id: string, items: ListedMessage[]) => (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/account/${id}`]}>
        <TriageActivityProvider>{section.element(id, items)}</TriageActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree(accountId, messages));
  return {
    ...view,
    show: (id: string, items: ListedMessage[]) => view.rerender(tree(id, items)),
  };
};

/** The count each rendered header of this section is showing, in DOM order. */
const headerCounts = (title: string): string[] =>
  screen
    .queryAllByRole("heading", { name: title })
    .map((h) => /\((\d+)\)/.exec(h.parentElement?.textContent ?? "")?.[1] ?? "");

/** One macrotask — long enough for a zeroed exit delay, far short of 250ms. */
const tick = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));

for (const section of CASES) {
  describe(`${section.name}'s header on an account switch`, () => {
    test("the outgoing header stays through the exit, then goes", async () => {
      const { show } = mountSection(section, "acc-1", messagesFor("acc-1", 2));
      expect(headerCounts(section.title)).toEqual(["2"]);

      show("acc-2", messagesFor("acc-2", 1));

      // Both are on screen: the one leaving still shows the count it left with,
      // rather than hard-cutting to the new account's.
      expect(headerCounts(section.title)).toEqual(["2", "1"]);
      await tick();
      expect(headerCounts(section.title)).toEqual(["2", "1"]);

      await waitFor(() => expect(headerCounts(section.title)).toEqual(["1"]));
    });

    test("a section that empties for the new account leaves rather than vanishing", async () => {
      const { show } = mountSection(section, "acc-1", messagesFor("acc-1", 3));

      show("acc-2", []);

      expect(headerCounts(section.title)).toEqual(["3"]);
      await waitFor(() => expect(headerCounts(section.title)).toEqual([]));
    });

    test("a section that fills for the new account enters", async () => {
      const { show } = mountSection(section, "acc-1", []);
      expect(headerCounts(section.title)).toEqual([]);

      show("acc-2", messagesFor("acc-2", 2));

      expect(headerCounts(section.title)).toEqual(["2"]);
    });

    test("a count changing within one account is a text update, not an exit", async () => {
      const { show } = mountSection(section, "acc-1", messagesFor("acc-1", 3));
      const before = screen.getByRole("heading", { name: section.title });

      show("acc-1", messagesFor("acc-1", 2));

      // One header throughout, and the same node: nothing was unmounted, so no
      // keyframe restarts and routine triage doesn't flicker.
      expect(headerCounts(section.title)).toEqual(["2"]);
      expect(screen.getByRole("heading", { name: section.title })).toBe(before);
      await tick();
      expect(headerCounts(section.title)).toEqual(["2"]);
    });

    test("reduced motion skips the delayed unmount", async () => {
      device.prefersReducedMotion = "reduce";
      const { show } = mountSection(section, "acc-1", messagesFor("acc-1", 2));

      show("acc-2", messagesFor("acc-2", 1));

      await tick();
      expect(headerCounts(section.title)).toEqual(["1"]);
    });
  });
}

/** What the app layout hands the page through the router's outlet context. */
const layout = (selectedAccountId: string): LayoutContext => {
  const start = new Date("2026-08-01T00:00:00.000Z");
  return {
    selectedAccountId,
    selectedLabelId: undefined,
    rangeStartIso: start.toISOString(),
    rangeEndIso: start.toISOString(),
    range: { start, end: start, key: "2026-08-01", mode: "week" },
    isCurrentPeriod: true,
    canGoNext: false,
    goPrev: () => {},
    goNext: () => {},
    goToday: () => {},
    viewMode: "all",
    setViewMode: () => {},
    selectedAccountEmail: undefined,
    sidebarCollapsed: false,
    onToggleSidebar: () => {},
  };
};

describe("the inbox hands each section the selected account", () => {
  /** The page as the app mounts it, with both mailboxes already cached. */
  const mountInbox = (selectedAccountId: string) => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    for (const [accountId, count] of [
      ["acc-1", 2],
      ["acc-2", 1],
    ] as const) {
      qc.setQueryData(
        queryKeys.messages({
          accountId,
          labelId: undefined,
          internalDateFrom: undefined,
          internalDateTo: undefined,
        }),
        {
          pages: [{ items: messagesFor(accountId, count), nextCursor: null }],
          pageParams: [undefined],
        },
      );
    }
    const page = (id: string) => (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/account/${id}`]}>
          <TriageActivityProvider>
            <Routes>
              <Route element={<Outlet context={layout(id)} />}>
                <Route path="/account/:accountId" element={<InboxPage />} />
              </Route>
            </Routes>
          </TriageActivityProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const view = render(page(selectedAccountId));
    return { switchTo: (id: string) => view.rerender(page(id)) };
  };

  // The page-level half: a section keyed on a constant, or on a value the page
  // never varies, would satisfy every test above and animate nothing in the app.
  test("switching the selected account plays the exit on the header the page was showing", async () => {
    const { switchTo } = mountInbox("acc-1");
    expect(headerCounts("High priority")).toEqual(["2"]);

    switchTo("acc-2");

    expect(headerCounts("High priority")).toEqual(["2", "1"]);
    await waitFor(() => expect(headerCounts("High priority")).toEqual(["1"]));
  });
});
