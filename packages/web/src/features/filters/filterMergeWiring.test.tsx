// The merge action, end to end: bulk bar → confirmation preview → endpoint →
// refetch. The pure halves (`mergePreview`, `filters.hooks`, `filterSelection`)
// have their own suites; what only the components can answer — that the bar
// offers the action at the right time, that the confirm step comes before the
// request, and what happens to the selection on each outcome — is asserted here.
//
// Rendered into the DOM harness (#129, #134) rather than matched against the
// components' source, which is what this suite used to do. Regexes over
// `AccountFiltersSection.tsx` pinned the shape of an `onError:` block: they
// passed on a card wired to the wrong handler and failed on a reformat. The
// seam stubbed is `fetch`, so the request the merge endpoint would receive is
// the real one.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MIN_MERGE_SOURCES } from "@miel/core/filterMergeSpec";
import { queryKeys } from "../../api/queries";
import { AccountFiltersSection } from "./AccountFiltersSection";
import { canMergeSelection } from "./mergePreview";
import { ACCOUNT, gmailFilter, gmailLabel } from "./gmailFilter.fixture";

/**
 * Stubs `fetch` rather than mocking `../../api/client`: a module mock is
 * process-global and owns `apiFetch` for every suite loaded after it, and going
 * through the real client also proves what the endpoint receives.
 */
const originalFetch = globalThis.fetch;
let requests: Array<{ url: string; method: string | undefined; body: unknown }> = [];

const answerWith = (body: unknown, status = 200) => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
};

const MERGED = {
  filter: gmailFilter({ id: "row-merged", gmailFilterId: "f-merged" }),
  deletedGmailFilterIds: ["f-newsletter", "f-digest"],
  failedDeletions: [] as { gmailFilterId: string; message: string }[],
};

beforeEach(() => {
  requests = [];
  answerWith(MERGED);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Two filters that fold cleanly into one, and a third that is never selected —
// so the preview can be shown to come from the picked rows and not the list.
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
const INVOICES = gmailFilter({
  id: "row-3",
  gmailFilterId: "f-invoices",
  criteria: { from: "billing@example.com" },
  action: { addLabelIds: ["L_BILLS"] },
});
const LABELS = [
  gmailLabel(),
  gmailLabel({ id: "label-row-2", gmailLabelId: "L_BILLS", name: "Bills" }),
];

/** What the merge algebra builds from NEWSLETTER + DIGEST — one OR expression. */
const MERGED_QUERY = "{from:newsletter@example.com OR from:digest@example.com}";

const renderSection = (filters = [NEWSLETTER, DIGEST, INVOICES]) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  // A cached list for the mutation's invalidation to land on.
  qc.setQueryData(queryKeys.filters(ACCOUNT.id), { filters, suggestions: [] });
  const view = render(
    <QueryClientProvider client={qc}>
      <AccountFiltersSection account={ACCOUNT} filters={filters} suggestions={[]} labels={LABELS} />
    </QueryClientProvider>,
  );
  return { ...view, qc };
};

const bulkBar = () => screen.queryByRole("region", { name: "Filter selection" });
const card = () => screen.queryByRole("region", { name: "Confirm filter merge" });
const checkboxes = () => screen.queryAllByLabelText<HTMLInputElement>("Select filter");

/** Enter select mode and tick the first `count` rows. */
const select = (count: number) => {
  fireEvent.click(screen.getByRole("button", { name: "Enter select mode" }));
  for (const box of checkboxes().slice(0, count)) fireEvent.click(box);
};

/** The bar's action names what it would fold, so it reads alone in a rotor. */
const barMerge = () => within(bulkBar()!).queryByRole("button", { name: /^Merge \d+ filters/ });
const openConfirm = () => fireEvent.click(barMerge()!);

describe("when the merge action is offered", () => {
  test("two selected filters is the floor, and it is the server's floor", () => {
    expect(canMergeSelection(0)).toBe(false);
    expect(canMergeSelection(1)).toBe(false);
    expect(canMergeSelection(2)).toBe(true);
    expect(canMergeSelection(7)).toBe(true);
    // Not a second copy of "2": the constant comes from the same module the
    // merge endpoint validates against.
    expect(canMergeSelection(MIN_MERGE_SOURCES)).toBe(true);
    expect(canMergeSelection(MIN_MERGE_SOURCES - 1)).toBe(false);
  });

  test("the bar offers the button only once the selection is a merge", () => {
    renderSection();
    select(1);

    // Absent, not disabled: a permanently greyed action on a one-filter
    // selection reads as broken.
    expect(barMerge()).toBeNull();

    fireEvent.click(checkboxes()[1]!);

    expect(barMerge()?.getAttribute("aria-label")).toBe("Merge 2 filters into one");
  });
});

describe("the confirmation step", () => {
  test("the bar's button opens a confirm rather than merging", () => {
    renderSection();
    select(2);

    openConfirm();

    expect(card()).not.toBeNull();
    // Nothing was created or deleted by opening it.
    expect(requests).toEqual([]);
  });

  test("the card previews the merged rule the way the list renders a filter", () => {
    renderSection();
    select(2);
    openConfirm();
    const preview = within(card()!);

    expect(preview.getByText("Merge 2 filters into one")).toBeDefined();
    // The rule, through the list's own criteria and action tags…
    expect(preview.getByText(MERGED_QUERY)).toBeDefined();
    expect(preview.getByText("News")).toBeDefined();
    // …built from the rows that were picked: the unselected filter is not in it.
    expect(preview.queryByText("Bills")).toBeNull();
    expect(preview.queryByText(/billing@example\.com/)).toBeNull();
  });

  test("the card belongs to select mode and leaves with it", () => {
    // Otherwise "Done" leaves a confirm card behind for a selection that the
    // exit just emptied. Both exits — the header toggle and the bar's Done —
    // have to close it.
    const exits = [
      () => screen.getByRole("button", { name: "Exit select mode", pressed: true }),
      () => within(bulkBar()!).getByRole("button", { name: "Exit select mode" }),
    ];

    for (const exit of exits) {
      const view = renderSection();
      select(2);
      openConfirm();
      expect(card()).not.toBeNull();

      fireEvent.click(exit());

      expect(card()).toBeNull();
      view.unmount();
    }
  });

  test("a selection the algebra rejects can't be confirmed at all", () => {
    // buildMergePreview already knows the merge is impossible; offering Merge
    // anyway would only spend a round trip to be told the same thing.
    const adds = gmailFilter({
      id: "row-a",
      gmailFilterId: "f-a",
      action: { addLabelIds: ["L_NEWS"] },
    });
    const removes = gmailFilter({
      id: "row-b",
      gmailFilterId: "f-b",
      criteria: { from: "other@example.com" },
      action: { removeLabelIds: ["L_NEWS"] },
    });
    renderSection([adds, removes]);
    select(2);

    openConfirm();
    const preview = within(card()!);

    expect(preview.getByText(/disagree about L_NEWS/)).toBeDefined();
    expect(preview.queryByRole("button", { name: "Merge" })).toBeNull();
    expect(preview.getByRole("button", { name: "Close" })).toBeDefined();
    expect(requests).toEqual([]);
  });
});

describe("what happens after the merge", () => {
  test("confirming sends the selected ids, then clears the selection and select mode", async () => {
    const { qc } = renderSection();
    select(2);
    openConfirm();

    fireEvent.click(within(card()!).getByRole("button", { name: "Merge" }));

    await waitFor(() => expect(card()).toBeNull());
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.body).toEqual({
      accountId: ACCOUNT.id,
      gmailFilterIds: ["f-newsletter", "f-digest"],
    });
    // The sources are gone and the replacement is in the refetched list, so
    // there is nothing left to select.
    expect(bulkBar()).toBeNull();
    expect(checkboxes()).toHaveLength(0);
    // …and the list refetches through the mutation's own invalidation.
    await waitFor(() =>
      expect(qc.getQueryState(queryKeys.filters(ACCOUNT.id))?.isInvalidated).toBe(true),
    );
  });

  test("failure shows the endpoint's sentence and keeps the selection and the confirm", async () => {
    answerWith(
      {
        error: "filter_merge_failed",
        message: "Gmail refused to create the merged filter.",
        reason: "unmergeable",
      },
      400,
    );
    renderSection();
    select(2);
    openConfirm();

    fireEvent.click(within(card()!).getByRole("button", { name: "Merge" }));

    // The sentence beside the code, not `filter_merge_failed` (#130).
    await waitFor(() =>
      expect(
        within(card()!).getByText(/Gmail refused to create the merged filter\./),
      ).toBeDefined(),
    );
    expect(within(card()!).queryByText(/filter_merge_failed/)).toBeNull();
    // Nothing was mutated, so the card stays open with the selection intact,
    // ready for another try.
    expect(within(bulkBar()!).getByText("2 filters selected")).toBeDefined();
    expect(within(card()!).getByRole("button", { name: "Merge" })).toBeDefined();
  });

  test("a source Gmail refused to delete is reported, not swallowed", async () => {
    // The endpoint answers 200 with `failedDeletions`: the merged filter exists
    // but an original outlived it and still matches mail.
    answerWith({
      ...MERGED,
      deletedGmailFilterIds: ["f-newsletter"],
      failedDeletions: [{ gmailFilterId: "f-digest", message: "Gmail said no" }],
    });
    renderSection();
    select(2);
    openConfirm();

    fireEvent.click(within(card()!).getByRole("button", { name: "Merge" }));

    await waitFor(() =>
      expect(screen.getByText(/Gmail would not delete 1 original filter/)).toBeDefined(),
    );
  });
});
