// The per-category actions are always on screen (#144).
//
// "Mark all as read", "Archive all" and "Delete all" used to sit at `opacity-0`
// and be lifted only by `group-hover/section:`. A pointer was therefore the one
// way to reach them: on a touch device the three buttons were in the DOM,
// invisible, and the category could never be acted on as a whole.
//
// Rendered rather than read as source, for what a render answers: the buttons
// are found and clicked with no hover event anywhere, and the click produces the
// request the account's own mailbox expects. Two things a render cannot answer
// are asserted on the rendered class list instead, and only those two — happy-dom
// loads no stylesheet, so "visible" and "does not overflow" have no computed
// value here. What replaces them is the mechanism itself: no ancestor of a
// button gates it on hover, and the heading is the element that gives way when
// the row runs out of room.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listedMessage } from "../api/listedMessage.fixture";
import type { ListedMessage } from "../api/types";
import { TriageActivityProvider } from "../contexts/TriageActivityContext";
import { PrioritySection } from "./PrioritySection";
import { UntriagedSection } from "./UntriagedSection";

interface Request {
  url: string;
  method: string;
  body: unknown;
}

const originalFetch = globalThis.fetch;
let requests: Request[] = [];

beforeEach(() => {
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    // Only the batch endpoint is expected; anything else is a query that has
    // escaped the cache, and should fail loudly rather than answer `{}`.
    if (!url.endsWith("/messages/batch")) throw new Error(`unexpected request: ${url}`);
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: JSON.parse(String(init?.body ?? "null")),
    });
    return new Response(JSON.stringify({ ok: true, action: "archive", count: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const UNREAD: ListedMessage["labels"][number] = {
  id: "lbl-unread",
  name: "UNREAD",
  gmailLabelId: "UNREAD",
  colorBg: null,
  colorFg: null,
};

const messagesFor = (accountId: string, count: number, unread = false): ListedMessage[] =>
  Array.from({ length: count }, (_, i) =>
    listedMessage({
      accountId,
      gmailMessageId: `${accountId}-msg-${i}`,
      priority: "high",
      labels: unread ? [UNREAD] : [],
    }),
  );

interface SectionCase {
  name: string;
  /** The `<h2>` the header carries, used to find the row the actions sit in. */
  title: string;
  element: (props: {
    accountId: string;
    messages: ListedMessage[];
    selectMode?: boolean;
    isLoading?: boolean;
  }) => ReactElement;
}

const CASES: SectionCase[] = [
  {
    name: "PrioritySection",
    title: "High",
    element: ({ accountId, messages, selectMode, isLoading }) => (
      <PrioritySection
        accountId={accountId}
        priority="high"
        messages={messages}
        selectMode={selectMode}
        isLoading={isLoading}
      />
    ),
  },
  {
    // No spinner of its own — triage activity lights the section's glow instead
    // — so `isLoading` simply has nothing to render here.
    name: "UntriagedSection",
    title: "Untriaged",
    element: ({ accountId, messages, selectMode }) => (
      <UntriagedSection accountId={accountId} messages={messages} selectMode={selectMode} />
    ),
  },
];

const ACTION_LABELS = ["Mark all as read", "Archive all", "Delete all"];

const mountSection = (
  section: SectionCase,
  accountId: string,
  messages: ListedMessage[],
  extra: { selectMode?: boolean; isLoading?: boolean } = {},
) => {
  const tree = (id: string, items: ListedMessage[], over: typeof extra) => (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/account/${id}`]}>
        <TriageActivityProvider>
          {section.element({ accountId: id, messages: items, ...over })}
        </TriageActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree(accountId, messages, extra));
  return {
    ...view,
    show: (id: string, items: ListedMessage[], over: typeof extra = {}) =>
      view.rerender(tree(id, items, over)),
  };
};

/** The header row the section's title sits in. */
const headerRow = (title: string): HTMLElement =>
  screen.getByRole("heading", { name: title }).closest("header")!;

/**
 * Every class on the chain from an element up to the `<section>` it sits in —
 * the whole of what the components own, since the hover gate this replaces was
 * a `group/section` on that root reaching down past the header.
 */
const classesUpToSection = (from: HTMLElement): string[] => {
  const classes: string[] = [];
  for (let node: HTMLElement | null = from; node; node = node.parentElement) {
    classes.push(...node.className.split(/\s+/).filter(Boolean));
    if (node.tagName === "SECTION") break;
  }
  return classes;
};

for (const section of CASES) {
  describe(`${section.name}'s category actions`, () => {
    test("all three are on screen with no hover", () => {
      mountSection(section, "acc-1", messagesFor("acc-1", 2));

      for (const label of ACTION_LABELS) {
        expect(screen.getByRole("button", { name: label })).toBeTruthy();
      }
    });

    test("nothing above a button hides it until hover", () => {
      mountSection(section, "acc-1", messagesFor("acc-1", 2));

      const classes = classesUpToSection(screen.getByRole("button", { name: "Archive all" }));

      expect(classes.filter((c) => c.includes("group-hover"))).toEqual([]);
      // The named group the gate hung off, gone with it rather than left as a
      // marker nothing reads.
      expect(classes.filter((c) => c.startsWith("group/"))).toEqual([]);
      expect(classes.filter((c) => c.startsWith("opacity-0"))).toEqual([]);
      expect(classes).not.toContain("invisible");
      expect(classes).not.toContain("hidden");
    });

    test("a plain click acts on the section — no pointer gesture first", async () => {
      mountSection(section, "acc-1", messagesFor("acc-1", 2));

      fireEvent.click(screen.getByRole("button", { name: "Archive all" }));

      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0]!.method).toBe("POST");
      expect(requests[0]!.body).toEqual({
        accountId: "acc-1",
        gmailMessageIds: ["acc-1-msg-0", "acc-1-msg-1"],
        action: "archive",
      });
    });

    test("'Mark all as read' waits on there being something unread", () => {
      const { show } = mountSection(section, "acc-1", messagesFor("acc-1", 2));
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "Mark all as read" }).disabled,
      ).toBe(true);

      show("acc-1", messagesFor("acc-1", 2, true));

      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "Mark all as read" }).disabled,
      ).toBe(false);
    });

    test("select mode owns the actions instead", () => {
      const { show } = mountSection(section, "acc-1", messagesFor("acc-1", 2), {
        selectMode: true,
      });
      expect(screen.queryByRole("button", { name: "Archive all" })).toBeNull();

      show("acc-1", messagesFor("acc-1", 2), { selectMode: false });

      expect(screen.getByRole("button", { name: "Archive all" })).toBeTruthy();
    });

    test("the leaving header carries none, so no action can hit the wrong account", () => {
      const { show } = mountSection(section, "acc-1", messagesFor("acc-1", 2));

      show("acc-2", messagesFor("acc-2", 1));

      // Both headers are on screen for the length of the exit. `messages` is
      // acc-2's, so only the arriving header may act.
      const headings = screen.getAllByRole("heading", { name: section.title });
      expect(headings).toHaveLength(2);
      const [leaving, arriving] = headings.map((h) => h.closest("header")!);
      expect(within(leaving!).queryByRole("button", { name: "Archive all" })).toBeNull();
      expect(within(arriving!).getByRole("button", { name: "Archive all" })).toBeTruthy();
    });

    test("the heading is the only part of the row that gives way", () => {
      // With the spinner up too, which is the widest the row ever gets.
      mountSection(section, "acc-1", messagesFor("acc-1", 2), { isLoading: true });

      // No layout in happy-dom, so the row's ability to fit is asserted where it
      // is decided: everything on the line refuses to be squeezed except the
      // title, which truncates. A chip, a count or a spinner that could shrink
      // would collapse before the heading did.
      for (const child of [...headerRow(section.title).children] as HTMLElement[]) {
        const classes = child.className.split(/\s+/);
        expect(classes).toContain(child.tagName === "H2" ? "truncate" : "shrink-0");
      }
    });
  });
}
