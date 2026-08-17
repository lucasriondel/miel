import { describe, expect, test } from "bun:test";
import { format } from "date-fns";
import { renderToStaticMarkup } from "react-dom/server";
import { TriagePanel } from "./TriagePanel";
import type { MessageDetail, Priority } from "../../api/types";

// #89 turns the triage card into one collapsible row. This package has no DOM
// harness, so what is asserted here is the markup the panel decides: what lands
// in the `<summary>` (visible at rest) versus in the `<details>` body, and the
// classes DESIGN.md legislates. Actual open/close is the browser's `<details>`
// and stays a manual criterion.

const REASONING_FIRST_LINE = "Sender is a known contact asking for a decision.";
const REASONING_SECOND_LINE = "The thread has been idle for three days.";

interface Run {
  id: string;
  priority: Priority;
  reasoning: string;
  model: string | null;
  createdAt: string;
}

const run = (over: Partial<Run> = {}): MessageDetail["triageHistory"][number] => ({
  id: "t1",
  priority: "high",
  reasoning: `${REASONING_FIRST_LINE}\n${REASONING_SECOND_LINE}`,
  model: "claude-opus-5",
  createdAt: "2026-08-09T09:30:00.000Z",
  existingLabelSuggestions: [],
  newLabelSuggestions: [],
  ...over,
});

const message = (history: MessageDetail["triageHistory"]): MessageDetail => ({
  accountId: "acc-1",
  accountEmail: "me@example.com",
  gmailMessageId: "m-1",
  gmailThreadId: "th-1",
  fromEmail: "her@example.com",
  fromName: "Her",
  toEmails: ["me@example.com"],
  subject: "Decision needed",
  snippet: null,
  bodyText: null,
  bodyHtml: null,
  internalDate: "2026-08-09T09:00:00.000Z",
  isArchived: false,
  isTrashed: false,
  rawHeaders: null,
  labels: [],
  attachments: [],
  latestTriageId: history[0]?.id ?? null,
  triageHistory: history,
});

const render = (history: MessageDetail["triageHistory"]) =>
  renderToStaticMarkup(<TriagePanel message={message(history)} />);

const triaged = render([run()]);

/** The markup of the first `<summary>` — everything visible while closed. */
const firstSummary = (html: string) => {
  const start = html.indexOf("<summary");
  return html.slice(start, html.indexOf("</summary>", start));
};

/** Class attributes of every `<summary>` in a fragment of markup. */
const summaryClasses = (html: string) =>
  [...html.matchAll(/<summary\b[^>]*class="([^"]*)"/g)].map(([, cls]) => cls!);

const older = [
  run(),
  run({
    id: "t0",
    priority: "low",
    reasoning: "Earlier pass read it as a newsletter.",
    model: "claude-sonnet-5",
    createdAt: "2026-08-08T08:00:00.000Z",
  }),
];

describe("at rest", () => {
  test("is a single collapsible row, not an expanded card", () => {
    expect(triaged).toContain("<details");
    expect(summaryClasses(triaged).length).toBe(1);
  });

  test("shows the sparkles glyph, the priority chip and the muted section label", () => {
    const summary = firstSummary(triaged);
    expect(summary).toContain("lucide-sparkles");
    expect(summary).toContain("bg-gousse-high");
    expect(summary).toMatch(/<h2[^>]*class="[^"]*text-gousse-muted[^"]*"[^>]*>\s*AI Triage/);
  });

  test("truncates the reasoning to its first line", () => {
    const summary = firstSummary(triaged);
    expect(summary).toContain(REASONING_FIRST_LINE);
    expect(summary).not.toContain(REASONING_SECOND_LINE);
    expect(summary).toContain("truncate");
  });

  test("keeps the run timestamp and model out of the closed row", () => {
    const summary = firstSummary(triaged);
    expect(summary).not.toContain("claude-opus-5");
    expect(summary).not.toContain("<time");
  });
});

describe("once opened", () => {
  test("reveals the full reasoning, every line of it", () => {
    const body = triaged.slice(triaged.indexOf("</summary>"));
    expect(body).toContain(REASONING_FIRST_LINE);
    expect(body).toContain(REASONING_SECOND_LINE);
    expect(body).toContain("whitespace-pre-line");
  });

  test("footers with the run timestamp and the model that produced it", () => {
    const body = triaged.slice(triaged.indexOf("</summary>"));
    expect(body).toContain(format(new Date("2026-08-09T09:30:00.000Z"), "PPpp"));
    // React 19 emits the attribute as authored; HTML matches it case-insensitively.
    expect(body).toMatch(/dateTime="2026-08-09T09:30:00\.000Z"/i);
    expect(body).toContain("tabular-nums");
    expect(body).toContain("claude-opus-5");
  });

  test("omits the model when the run recorded none", () => {
    const html = render([run({ model: null })]);
    expect(html).toContain(format(new Date("2026-08-09T09:30:00.000Z"), "PPpp"));
    expect(html).not.toContain("· ");
  });
});

describe("earlier runs", () => {
  test("are reachable inside the opened body, not as a second row at rest", () => {
    const html = render(older);
    const summaries = summaryClasses(html);
    expect(summaries.length).toBe(2);
    // The earlier-runs disclosure opens inside the first one's body.
    expect(html.lastIndexOf("<details")).toBeGreaterThan(html.indexOf("</summary>"));
    expect(firstSummary(html)).not.toContain("earlier triage run");
  });

  test("list each previous verdict with its own chip, timestamp and model", () => {
    const html = render(older);
    expect(html).toContain("1 earlier triage run");
    expect(html).toContain("Earlier pass read it as a newsletter.");
    expect(html).toContain("bg-gousse-low");
    expect(html).toContain("claude-sonnet-5");
  });

  test("pluralize the count", () => {
    expect(render([...older, run({ id: "t-2", createdAt: "2026-08-07T07:00:00.000Z" })])).toContain(
      "2 earlier triage runs",
    );
  });

  test("show no affordance at all for a message with exactly one run", () => {
    expect(triaged).not.toContain("earlier triage run");
    expect(summaryClasses(triaged).length).toBe(1);
  });

  // A nested `<details>` inheriting the outer `group` would rotate its chevron
  // the moment the *outer* row opened, since `group-open:` matches any open
  // `.group` ancestor. The inner row has to scope its own group.
  test("scope their chevron to their own group so the outer row cannot rotate it", () => {
    const html = render(older);
    const nested = html.slice(html.lastIndexOf("<details"));
    expect(nested).toContain("group/nested");
    expect(nested).toContain("group-open/nested:rotate-180");
    expect(nested).not.toMatch(/[^/]group-open:rotate-180/);
  });
});

describe("the surface", () => {
  test("is the shared rounded-3xl card, not the old rounded-xl one", () => {
    expect(triaged).toContain("rounded-3xl");
    expect(triaged).not.toContain("rounded-xl");
  });

  test("drops the accent gradient wash — §1 tints by lowering alpha on a flat fill", () => {
    expect(triaged).not.toContain("bg-gradient");
    expect(render([])).not.toContain("bg-gradient");
  });

  test("heads with a muted section label rather than an accent one (§1, §4)", () => {
    expect(triaged).not.toMatch(/<h2[^>]*text-gousse-accent/);
    expect(triaged).toMatch(/uppercase tracking-wide/);
  });

  test("keeps the semantic priority token colors (§1)", () => {
    expect(render([run({ priority: "high" })])).toContain("bg-gousse-high");
    expect(render([run({ priority: "medium" })])).toContain("bg-gousse-medium");
    expect(render([run({ priority: "low" })])).toContain("bg-gousse-low");
  });

  test("hard-codes no color for chrome", () => {
    expect(render(older)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("the untriaged empty state", () => {
  const empty = render([]);

  test("keeps its dashed treatment and its run-a-sync message", () => {
    expect(empty).toContain("border-dashed");
    expect(empty).toContain("run a sync");
  });

  test("takes the shared card radius and drops the gradient", () => {
    expect(empty).toContain("rounded-3xl");
    expect(empty).not.toContain("rounded-xl");
    expect(empty).not.toContain("bg-gradient");
  });

  test("offers nothing to open", () => {
    expect(empty).not.toContain("<details");
  });
});

describe("the summary row as a control (§5)", () => {
  test("is a full-width target at least 40px tall that presses", () => {
    for (const cls of summaryClasses(render(older))) {
      expect(cls).toContain("w-full");
      expect(cls).toContain("min-h-10");
      expect(cls).toContain("active:scale-[0.96]");
      expect(cls).not.toContain("transition-all");
      expect(cls).toMatch(/transition-\[/);
    }
  });

  test("clears the corner arc with the row inset §3 asks for", () => {
    expect(summaryClasses(triaged)[0]).toContain("px-5");
  });
});
