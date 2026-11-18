import { describe, expect, test } from "bun:test";
import { format } from "date-fns";
import { renderToStaticMarkup } from "react-dom/server";
import { TriagePanel } from "./TriagePanel";
import type { MessageDetail, Priority } from "../../api/types";
import { priorityInk } from "../../lib/priorityColors";
import { priorityBanner } from "./priorityBanner";

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
  ccEmails: [],
  replyAllCc: [],
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

  // UI System › Priority Banner: a dot in the level's colour and the verdict
  // spelled out, on the level's own tint.
  test("is the priority banner: a dot, the verdict in words, the level's tint", () => {
    const summary = firstSummary(triaged);
    const banner = priorityBanner("high");
    expect(summary).toContain("High priority —");
    expect(summary).toContain(banner.dot);
    expect(summary).toContain(banner.text);
    expect(triaged).toContain(banner.surface);
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

  test("list each previous verdict with its own priority, timestamp and model", () => {
    const html = render(older);
    expect(html).toContain("1 earlier triage run");
    expect(html).toContain("Earlier pass read it as a newsletter.");
    expect(html).toContain(">low</span>");
    expect(html).toContain(priorityInk("low"));
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
  test("is an 8px-cornered band, not a card", () => {
    expect(triaged).toMatch(/<details[^>]*class="[^"]*rounded-lg/);
    expect(triaged).not.toContain("rounded-3xl");
  });

  test("drops the accent gradient wash — §1 tints by lowering alpha on a flat fill", () => {
    expect(triaged).not.toContain("bg-gradient");
    expect(render([])).not.toContain("bg-gradient");
  });

  // #141: colour is emphasis, never the only carrier — each banner spells its
  // level out, and wears that level's own tint and text colour.
  test("spells every level out and wears that level's tint", () => {
    for (const priority of ["high", "medium", "low"] as const) {
      const html = render([run({ priority })]);
      const banner = priorityBanner(priority);
      expect(html).toContain(`${banner.label} —`);
      expect(html).toContain(banner.surface);
      expect(html).toContain(banner.text);
      expect(html).not.toContain("text-white");
    }
  });

  test("hard-codes no color for chrome", () => {
    expect(render(older)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("the untriaged empty state", () => {
  const empty = render([]);

  // UI System › Priority Banner, "classifying": the banner's own shape on the
  // hover fill, with a hairline and the run-a-sync message.
  test("takes the banner's shape with its run-a-sync message", () => {
    expect(empty).toContain("rounded-lg");
    expect(empty).toContain("border border-gousse-line");
    expect(empty).toContain("run a sync");
    expect(empty).not.toContain("bg-gradient");
  });

  test("offers nothing to open", () => {
    expect(empty).not.toContain("<details");
  });
});

describe("the summary row as a control", () => {
  test("is a full-width target with a named transition", () => {
    for (const cls of summaryClasses(render(older))) {
      expect(cls).toContain("w-full");
      expect(cls).not.toContain("transition-all");
      expect(cls).toMatch(/transition-\[/);
    }
  });

  test("is the banner's 38px height with its 12px inset", () => {
    const [banner] = summaryClasses(triaged);
    expect(banner).toContain("min-h-[38px]");
    expect(banner).toContain("px-3");
  });
});
