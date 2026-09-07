// Category subgroups inside a priority section (reqs. 4, 7, 8, 9).
//
// A priority section's card used to be a flat run of rows. It is now one band
// per Gmail category, each with a heading that collapses it — and, while
// collapsed, previews its senders on one line the way Google Inbox did.
//
// Rendered rather than read as source, the repo's standard: the headings are
// found by their accessible names, collapsed by a click, and what a reader can
// see afterwards is what is asserted. The two things a render cannot answer —
// "does hovering move anything" has no computed geometry under happy-dom — are
// asserted as the mechanism instead: the date and the actions are in one grid
// cell, and the cell that reveals on hover is mounted whether or not it shows.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listedMessage } from "../api/listedMessage.fixture";
import type { ListedMessage } from "../api/types";
import { TriageActivityProvider } from "../contexts/TriageActivityContext";
import { PrioritySection } from "./PrioritySection";
import { UntriagedSection } from "./UntriagedSection";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  // Nothing here should reach the network; a query that escapes the cache must
  // fail loudly rather than answer `{}`.
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    throw new Error(`unexpected request: ${String(input)}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.clear();
});

const label = (name: string) => ({
  id: name,
  gmailLabelId: name,
  name,
  colorBg: null,
  colorFg: null,
});

const inCategory = (
  category: string,
  id: string,
  from: string,
  over: Partial<ListedMessage> = {},
): ListedMessage =>
  listedMessage({
    accountId: "acc-1",
    gmailMessageId: id,
    fromName: from,
    subject: `subject ${id}`,
    priority: "high",
    labels: [label(category)],
    ...over,
  });

const mount = (
  messages: ListedMessage[],
  accountId = "acc-1",
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void,
) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/account/${accountId}`]}>
        <TriageActivityProvider>
          <PrioritySection
            accountId={accountId}
            priority="high"
            messages={messages}
            onToggleCategory={onToggleCategory}
          />
        </TriageActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("a priority section's category subgroups", () => {
  test("splits its rows into one band per Gmail category", () => {
    mount([
      inCategory("CATEGORY_PERSONAL", "m-1", "Simon"),
      inCategory("CATEGORY_PROMOTIONS", "m-2", "KoRo"),
      inCategory("CATEGORY_UPDATES", "m-3", "SNCF"),
    ]);

    // The label each category is known by, from `systemLabels`.
    expect(screen.getByRole("button", { name: "Collapse Primary" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse Promotions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse Notifications" })).toBeTruthy();
  });

  test("counts each band's own messages", () => {
    mount([
      inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo"),
      inCategory("CATEGORY_PROMOTIONS", "m-2", "Vinted"),
      inCategory("CATEGORY_UPDATES", "m-3", "SNCF"),
    ]);

    const promos = screen.getByRole("button", { name: "Collapse Promotions" });
    expect(within(promos).getByText("2")).toBeTruthy();
    const updates = screen.getByRole("button", { name: "Collapse Notifications" });
    expect(within(updates).getByText("1")).toBeTruthy();
  });

  test("groups a message Gmail tagged with no category under Primary", () => {
    // The common case on an account with the category tabs turned off.
    mount([
      listedMessage({
        accountId: "acc-1",
        gmailMessageId: "m-1",
        priority: "high",
        labels: [label("INBOX")],
      }),
    ]);

    expect(screen.getByRole("button", { name: "Collapse Primary" })).toBeTruthy();
  });

  test("keeps the priority heading and its count outside the card (req. 8)", () => {
    mount([inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo")]);

    // The section's own header is still a sibling of the card, not a band in it.
    const heading = screen.getByRole("heading", { name: "High" });
    expect(heading.closest("header")).toBeTruthy();
    expect(heading.closest(".category-group")).toBeNull();
  });
});

/**
 * Whether a rendered row is one the user can actually see and reach.
 *
 * A collapsed group keeps its rows mounted so the close can animate, so their
 * text is still in the DOM and `queryByText` cannot answer this. What does is
 * `inert` on the body: it is the attribute that takes the rows out of the tab
 * order and away from assistive tech, so it *is* the hidden-ness rather than a
 * proxy for it. Testing Library's queries do not honour it (nor does happy-dom
 * apply it), which is why this is asserted rather than expressed as a query.
 */
const isHidden = (text: RegExp) => {
  const row = screen.getByText(text);
  return row.closest("[inert]") !== null;
};

describe("collapsing a category", () => {
  test("hides its rows and offers to expand it again", () => {
    mount([inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo")]);
    expect(isHidden(/subject m-1/)).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Promotions" }));

    expect(isHidden(/subject m-1/)).toBe(true);
    expect(screen.getByRole("button", { name: "Expand Promotions" })).toBeTruthy();
  });

  test("expanding it again brings the rows back", () => {
    mount([inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo")]);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Promotions" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Promotions" }));

    expect(isHidden(/subject m-1/)).toBe(false);
  });

  test("leaves the other categories alone", () => {
    mount([
      inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo"),
      inCategory("CATEGORY_UPDATES", "m-2", "SNCF"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Promotions" }));

    expect(isHidden(/subject m-1/)).toBe(true);
    expect(isHidden(/subject m-2/)).toBe(false);
  });

  test("previews its senders on one line, each named once (req. 7)", () => {
    mount([
      inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo"),
      inCategory("CATEGORY_PROMOTIONS", "m-2", "Vinted"),
      inCategory("CATEGORY_PROMOTIONS", "m-3", "KoRo"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Promotions" }));

    // Deduped, in the order of each sender's newest message — a thread of
    // replies must not spend the whole line on one name.
    expect(screen.getByText("KoRo, Vinted")).toBeTruthy();
  });

  test("shows no sender run while it is open", () => {
    mount([inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo")]);

    // The rows below are already naming these senders.
    expect(screen.queryByText("KoRo", { selector: "span.flex-1" })).toBeNull();
  });

  test("remembers the choice per account", () => {
    const view = mount([inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo")]);
    fireEvent.click(screen.getByRole("button", { name: "Collapse Promotions" }));
    view.unmount();

    mount([inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo")]);
    expect(screen.getByRole("button", { name: "Expand Promotions" })).toBeTruthy();
  });

  test("is a preference of that account alone", () => {
    const view = mount([inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo")]);
    fireEvent.click(screen.getByRole("button", { name: "Collapse Promotions" }));
    view.unmount();

    mount(
      [
        listedMessage({
          accountId: "acc-2",
          gmailMessageId: "m-9",
          priority: "high",
          labels: [label("CATEGORY_PROMOTIONS")],
        }),
      ],
      "acc-2",
    );
    expect(screen.getByRole("button", { name: "Collapse Promotions" })).toBeTruthy();
  });
});

describe("acting on one category", () => {
  test("names the band it acts on, so the section's own actions stay distinct", () => {
    mount([inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo")]);

    // The section header's three, unqualified…
    expect(screen.getByRole("button", { name: "Archive all" })).toBeTruthy();
    // …and the band's, which say which band.
    expect(screen.getByRole("button", { name: "Archive all in Promotions" })).toBeTruthy();
  });

  test("carries the category select onto the band, handing up only its own rows", () => {
    const handed: { accountId: string; ids: string[] }[] = [];
    mount(
      [
        inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo"),
        inCategory("CATEGORY_UPDATES", "m-2", "SNCF"),
      ],
      "acc-1",
      (accountId, ids) => handed.push({ accountId, ids }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Select all promotions messages" }));

    // The band's own messages, not the section's — the select moved one level
    // deeper with the heading it sits on.
    expect(handed).toEqual([{ accountId: "acc-1", ids: ["m-1"] }]);
  });
});

describe("untriaged", () => {
  test("groups by category the same way (a category in the same sense, #146)", () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={["/account/acc-1"]}>
          <TriageActivityProvider>
            <UntriagedSection
              accountId="acc-1"
              messages={[
                inCategory("CATEGORY_PROMOTIONS", "m-1", "KoRo", { priority: null }),
                inCategory("CATEGORY_UPDATES", "m-2", "SNCF", { priority: null }),
              ]}
            />
          </TriageActivityProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Collapse Promotions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse Notifications" })).toBeTruthy();
  });
});
