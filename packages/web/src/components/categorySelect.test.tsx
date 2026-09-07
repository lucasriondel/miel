// A whole priority category is selectable in one action (#146).
//
// Multi-select shipped with a row checkbox and a "Select all (n)" for the whole
// inbox, and nothing between the two: picking exactly the High-priority messages
// meant ticking them one at a time. Each section header now carries a control
// that selects its own category — and clears it when it is already whole.
//
// Rendered rather than read as source, the repo's standard for anything a render
// reaches: what is worth asserting is that the control is found and pressed the
// way a user does, and that the ids it hands up belong to the account on screen.
// The end-to-end half — the bulk bar's count and its request — is
// `features/select/categorySelectWiring.test.tsx`.
import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listedMessage } from "../api/listedMessage.fixture";
import type { ListedMessage } from "../api/types";
import { TriageActivityProvider } from "../contexts/TriageActivityContext";
import { PrioritySection } from "./PrioritySection";
import { UntriagedSection } from "./UntriagedSection";

const messagesFor = (accountId: string, count: number): ListedMessage[] =>
  Array.from({ length: count }, (_, i) =>
    listedMessage({
      accountId,
      gmailMessageId: `${accountId}-msg-${i}`,
      priority: "high",
    }),
  );

interface SectionProps {
  accountId: string;
  messages: ListedMessage[];
  selectMode?: boolean;
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
}

interface SectionCase {
  name: string;
  /** The `<h2>` the header carries, used to find the row the control sits in. */
  title: string;
  /** How the control names this category. */
  selectLabel: string;
  clearLabel: string;
  element: (props: SectionProps) => ReactElement;
}

const CASES: SectionCase[] = [
  {
    name: "PrioritySection",
    title: "High",
    selectLabel: "Select all high priority messages",
    clearLabel: "Clear high priority selection",
    element: (props) => <PrioritySection priority="high" {...props} />,
  },
  {
    // Not a priority, but a category in the same sense — and the same control.
    name: "UntriagedSection",
    title: "Untriaged",
    selectLabel: "Select all untriaged messages",
    clearLabel: "Clear untriaged selection",
    element: (props) => <UntriagedSection {...props} />,
  },
];

const mountSection = (section: SectionCase, props: SectionProps) => {
  const tree = (over: SectionProps) => (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/account/${over.accountId}`]}>
        <TriageActivityProvider>{section.element(over)}</TriageActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree(props));
  return { ...view, show: (over: SectionProps) => view.rerender(tree(over)) };
};

/**
 * Every class on the chain from an element up to its `<section>` — where a
 * hover gate would have to live, and the reason #144's actions were unreachable
 * on a touch device.
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
  describe(`${section.name}'s category select`, () => {
    const wired = (
      over: Partial<SectionProps> = {},
    ): SectionProps & {
      calls: [string, string[]][];
    } => {
      const calls: [string, string[]][] = [];
      return {
        accountId: "acc-1",
        messages: messagesFor("acc-1", 2),
        onToggleCategory: (accountId, ids) => calls.push([accountId, ids]),
        calls,
        ...over,
      };
    };

    test("a plain click selects the category — no hover, no select mode first", () => {
      const props = wired();
      mountSection(section, props);

      fireEvent.click(screen.getByRole("button", { name: section.selectLabel }));

      expect(props.calls).toEqual([["acc-1", ["acc-1-msg-0", "acc-1-msg-1"]]]);
    });

    test("nothing above it hides it until hover", () => {
      mountSection(section, wired());

      const classes = classesUpToSection(screen.getByRole("button", { name: section.selectLabel }));

      expect(classes.filter((c) => c.includes("group-hover"))).toEqual([]);
      expect(classes.filter((c) => c.startsWith("opacity-0"))).toEqual([]);
      expect(classes).not.toContain("invisible");
      expect(classes).not.toContain("hidden");
    });

    test("it stays in select mode, where the per-category actions do not", () => {
      mountSection(section, wired({ selectMode: true }));

      expect(screen.getByRole("button", { name: section.selectLabel })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Archive all" })).toBeNull();
    });

    test("a fully selected category offers to clear itself instead", () => {
      const props = wired({ isSelected: () => true, selectMode: true });
      mountSection(section, props);

      expect(screen.queryByRole("button", { name: section.selectLabel })).toBeNull();
      const clear = screen.getByRole("button", { name: section.clearLabel });
      expect(clear.getAttribute("aria-pressed")).toBe("true");

      fireEvent.click(clear);

      // The same call — which of the two it is, is the reducer's decision.
      expect(props.calls).toEqual([["acc-1", ["acc-1-msg-0", "acc-1-msg-1"]]]);
    });

    test("a partly selected category still offers to select the rest", () => {
      mountSection(
        section,
        wired({ selectMode: true, isSelected: (_a, id) => id === "acc-1-msg-0" }),
      );

      const select = screen.getByRole("button", { name: section.selectLabel });
      expect(select.getAttribute("aria-pressed")).toBe("false");
    });

    test("only the shown account's messages are ever handed up", () => {
      const props = wired({
        messages: [...messagesFor("acc-1", 2), ...messagesFor("acc-2", 1)],
      });
      mountSection(section, props);

      fireEvent.click(screen.getByRole("button", { name: section.selectLabel }));

      expect(props.calls).toEqual([["acc-1", ["acc-1-msg-0", "acc-1-msg-1"]]]);
    });

    test("the leaving header carries none, so no select can reach the wrong account", () => {
      const { show } = mountSection(section, wired());

      show(wired({ accountId: "acc-2", messages: messagesFor("acc-2", 1) }));

      // Both headers are up for the length of the exit; `messages` is acc-2's,
      // so only the arriving header may act on it.
      const headings = screen.getAllByRole("heading", { name: section.title });
      expect(headings).toHaveLength(2);
      const [leaving, arriving] = headings.map((h) => h.closest("header")!);
      expect(within(leaving!).queryByRole("button", { name: /select all/i })).toBeNull();
      expect(within(arriving!).getByRole("button", { name: section.selectLabel })).toBeTruthy();
    });

    test("the heading is still the only part of the row that gives way", () => {
      mountSection(section, wired({ selectMode: true }));

      const row = screen.getByRole("heading", { name: section.title }).closest("header")!;
      for (const child of [...row.children] as HTMLElement[]) {
        const classes = child.className.split(/\s+/);
        expect(classes).toContain(child.tagName === "H2" ? "truncate" : "shrink-0");
      }
    });

    test("a section nobody wired it to shows no control", () => {
      mountSection(section, { accountId: "acc-1", messages: messagesFor("acc-1", 2) });

      expect(screen.queryByRole("button", { name: /select all/i })).toBeNull();
    });
  });
}
