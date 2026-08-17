// Selecting filters, as a user does it: a toggle in the header turns the rows
// into checkboxes, a bulk bar counts what is picked, and leaving takes the
// selection with it.
//
// Rendered into the DOM harness (#129, #134) rather than matched against the
// components' source, which is what this suite used to do. The regexes asserted
// spelling — `selected={selection.isSelected(account.id, …)}` — so a rename
// broke them with no behaviour changed, and a row wired to the wrong account's
// selection could still satisfy them. What `filterSelection.ts` decides has its
// own suite next door; this is the wiring, asserted through the screen.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LayoutContext } from "../../App";
import { queryKeys } from "../../api/queries";
import { FiltersPage } from "../../pages/FiltersPage";
import { SelectModeButton } from "../select/SelectModeButton";
import { AccountFiltersSection } from "./AccountFiltersSection";
import { ACCOUNT, gmailFilter, gmailLabel } from "./gmailFilter.fixture";

// Nothing here presses a button that mutates, so any request is a mistake.
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    throw new Error(`unexpected request: ${String(input)}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const NEWSLETTER = gmailFilter({
  id: "row-1",
  gmailFilterId: "f-newsletter",
  criteria: { from: "newsletter@example.com" },
});
const DIGEST = gmailFilter({
  id: "row-2",
  gmailFilterId: "f-digest",
  criteria: { from: "digest@example.com" },
});
const LABELS = [gmailLabel()];

const renderSection = (filters = [NEWSLETTER, DIGEST]) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccountFiltersSection account={ACCOUNT} filters={filters} suggestions={[]} labels={LABELS} />
    </QueryClientProvider>,
  );

const enterSelectMode = () =>
  fireEvent.click(screen.getByRole("button", { name: "Enter select mode" }));

const bulkBar = () => screen.queryByRole("region", { name: "Filter selection" });
const checkboxes = () => screen.queryAllByLabelText<HTMLInputElement>("Select filter");
// Both ways out carry the same name; the header toggle is the pressed one, the
// bar's "Done" the one inside the landmark.
const exitFromHeader = () =>
  fireEvent.click(screen.getByRole("button", { name: "Exit select mode", pressed: true }));
const exitFromBar = () =>
  fireEvent.click(within(bulkBar()!).getByRole("button", { name: "Exit select mode" }));

describe("entering and leaving select mode", () => {
  test("the rows are plain until the toggle is pressed", () => {
    renderSection();

    expect(bulkBar()).toBeNull();
    expect(checkboxes()).toHaveLength(0);

    enterSelectMode();

    expect(bulkBar()).not.toBeNull();
    expect(checkboxes()).toHaveLength(2);
  });

  test("either exit leaves, and empties the selection on the way out", () => {
    // The header toggle and the bar's "Done" are two doors out of one mode.
    for (const exit of [exitFromHeader, exitFromBar]) {
      const view = renderSection();
      enterSelectMode();
      fireEvent.click(checkboxes()[0]!);
      expect(within(bulkBar()!).getByText("1 filter selected")).toBeDefined();

      exit();

      expect(bulkBar()).toBeNull();
      expect(checkboxes()).toHaveLength(0);

      // Re-entering starts from nothing: a selection kept behind the checkboxes
      // could only resurface as a surprise.
      enterSelectMode();
      expect(within(bulkBar()!).getByText("No filters selected")).toBeDefined();
      expect(checkboxes().filter((box) => box.checked)).toHaveLength(0);

      view.unmount();
    }
  });

  test("the toggle names filters, not messages, in its idle tooltip", () => {
    const view = renderSection();

    expect(screen.getByRole("button", { name: "Enter select mode" }).title).toBe("Select filters");
    view.unmount();

    // The shared button keeps the inbox wording as its default.
    render(<SelectModeButton active={false} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Enter select mode" }).title).toBe("Select messages");
  });
});

describe("the rows", () => {
  test("a checkbox reflects its own row, and only its own", () => {
    renderSection();
    enterSelectMode();

    fireEvent.click(checkboxes()[1]!);

    expect(checkboxes().map((box) => box.checked)).toEqual([false, true]);
    expect(within(bulkBar()!).getByText("1 filter selected")).toBeDefined();

    // …and untoggles, rather than only ever adding.
    fireEvent.click(checkboxes()[1]!);
    expect(checkboxes().map((box) => box.checked)).toEqual([false, false]);
  });

  test("delete is out of reach while selecting", () => {
    // Same call as MessageRow: a destructive per-row action next to a
    // multi-select checkbox is a misclick waiting to happen.
    renderSection();
    expect(screen.getAllByRole("button", { name: "Delete filter" })).toHaveLength(2);

    enterSelectMode();

    expect(screen.queryAllByRole("button", { name: "Delete filter" })).toHaveLength(0);
  });
});

describe("the bulk bar", () => {
  test("it counts what is selected, in a landmark a screen reader can jump to", () => {
    // `<section aria-label>` rather than `role="region"`, which is the same role
    // spelled longhand.
    renderSection();
    enterSelectMode();
    const bar = within(bulkBar()!);

    expect(bar.getByText("No filters selected")).toBeDefined();

    fireEvent.click(checkboxes()[0]!);
    expect(bar.getByText("1 filter selected")).toBeDefined();

    fireEvent.click(checkboxes()[1]!);
    expect(bar.getByText("2 filters selected")).toBeDefined();
  });

  test("its select-all covers the filters currently visible", () => {
    // The search box can hide rows; selecting all should not reach past what
    // the user can see.
    renderSection();
    enterSelectMode();
    fireEvent.change(screen.getByLabelText("Search active filters"), {
      target: { value: "digest" },
    });
    expect(checkboxes()).toHaveLength(1);

    fireEvent.click(within(bulkBar()!).getByRole("button", { name: "Select all (1)" }));

    expect(within(bulkBar()!).getByText("1 filter selected")).toBeDefined();

    // The hidden row was left alone — select-all reached the visible one only.
    fireEvent.click(screen.getByRole("button", { name: "Clear filter search" }));
    expect(checkboxes().map((box) => box.checked)).toEqual([false, true]);
  });
});

const OTHER = { ...ACCOUNT, id: "acc-2", email: "other@example.com" };
// The same Gmail filter id under both accounts: selection keys are
// account-scoped, so one account's pick can never light up the other's row.
const SHARED = { gmailFilterId: "f-shared", criteria: { from: "shared@example.com" } };

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
    viewMode: "week",
    setViewMode: () => {},
    selectedAccountEmail: undefined,
    sidebarCollapsed: false,
    onToggleSidebar: () => {},
  };
};

describe("account scoping", () => {
  /** The filters page as the app mounts it, for one selected account. */
  const renderPage = (selectedAccountId: string) => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    qc.setQueryData(queryKeys.accounts, [ACCOUNT, OTHER]);
    for (const account of [ACCOUNT, OTHER]) {
      qc.setQueryData(queryKeys.filters(account.id), {
        filters: [gmailFilter({ accountId: account.id, ...SHARED })],
        suggestions: [],
      });
      qc.setQueryData(queryKeys.labels(account.id), LABELS);
    }
    const page = (id: string) => (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/filters"]}>
          <Routes>
            <Route element={<Outlet context={layout(id)} />}>
              <Route path="/filters" element={<FiltersPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const view = render(page(selectedAccountId));
    return { switchTo: (id: string) => view.rerender(page(id)) };
  };

  test("switching accounts drops the selection rather than carrying it over", () => {
    const { switchTo } = renderPage(ACCOUNT.id);
    enterSelectMode();
    fireEvent.click(checkboxes()[0]!);
    expect(within(bulkBar()!).getByText("1 filter selected")).toBeDefined();

    switchTo(OTHER.id);

    // The other mailbox's identically-numbered filter is not selected — and
    // there is no select mode left to show it in.
    expect(bulkBar()).toBeNull();
    expect(checkboxes()).toHaveLength(0);

    switchTo(ACCOUNT.id);
    expect(bulkBar()).toBeNull();
  });
});
