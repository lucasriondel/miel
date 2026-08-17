import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageDetailHeader } from "./MessageDetailHeader";
import type { MessageDetail } from "../../api/types";

// #88: the header's four-row From/To/Date/Account table becomes a sender line
// plus a `Details` disclosure. This package has no DOM harness, so open/close
// stays the browser's `<details>` and a manual criterion; what is asserted here
// is which values sit at rest and which sit inside the disclosure, plus the
// classes DESIGN.md legislates (§3 pill, §4 truncation and tabular numerals,
// §5 press feedback and hit area).

const base: MessageDetail = {
  accountId: "acc-1",
  accountEmail: "me@example.com",
  gmailMessageId: "m-1",
  gmailThreadId: "t-1",
  fromEmail: "bob@corp.example",
  fromName: "Bob Vance",
  toEmails: ["me@example.com"],
  subject: "Refrigeration quote",
  snippet: null,
  bodyText: null,
  bodyHtml: null,
  internalDate: "2026-06-03T16:05:00.000Z",
  isArchived: false,
  isTrashed: false,
  rawHeaders: null,
  labels: [{ id: "l1", gmailLabelId: "Label_1", name: "Work", colorBg: null, colorFg: null }],
  attachments: [
    {
      attachmentId: "a1",
      filename: "quote.pdf",
      mimeType: "application/pdf",
      size: 1024,
    },
  ],
  latestTriageId: null,
  triageHistory: [],
};

const render = (overrides: Partial<MessageDetail> = {}) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MessageDetailHeader message={{ ...base, ...overrides }} />
    </QueryClientProvider>,
  );

/** Markup up to the disclosure — everything the reader sees without clicking. */
const atRest = (html: string) => html.slice(0, html.indexOf("<details"));
/** Markup from the disclosure on — the collapsed metadata. */
const behindDetails = (html: string) => html.slice(html.indexOf("<details"));

/** Class attributes of every `<summary>` in a fragment of markup. */
const summaryClasses = (html: string) =>
  [...html.matchAll(/<summary\b[^>]*class="([^"]*)"/g)].map(([, cls]) => cls!);

describe("the resting header", () => {
  test("shows the subject, the sender and the time — no metadata table", () => {
    const rest = atRest(render());
    expect(rest).toContain("Refrigeration quote");
    expect(rest).toContain("Bob Vance");
    expect(rest).toContain("bob@corp.example");
    expect(rest).not.toContain("<dl");
    expect(rest).not.toMatch(/>From</);
    expect(rest).not.toMatch(/>Account</);
    expect(rest).not.toContain("me@example.com");
  });

  test("keeps the bottom hairline that separates it from the page", () => {
    expect(render()).toMatch(/<header[^>]*class="[^"]*border-b/);
  });

  test("truncates the sender address rather than wrapping it, full value on hover (§4)", () => {
    const address = atRest(render()).match(
      /<span[^>]*title="bob@corp\.example"[^>]*class="([^"]*)"|<span[^>]*class="([^"]*)"[^>]*title="bob@corp\.example"/,
    );
    expect(address).not.toBeNull();
    expect(address![1] ?? address![2]).toContain("truncate");
  });

  test("sets the timestamp in tabular numerals inside a machine-readable <time> (§4)", () => {
    const rest = atRest(render());
    const time = rest.match(/<time[^>]*>/)?.[0] ?? "";
    expect(time).toContain("tabular-nums");
    // HTML attribute names are case-insensitive; React emits this one camel-cased.
    expect(time.toLowerCase()).toContain('datetime="2026-06-03t16:05:00.000z"');
  });

  test("heads the sender line with an avatar of their initials", () => {
    expect(atRest(render())).toContain("BV");
    expect(atRest(render({ fromName: null }))).toContain("BO");
  });
});

describe("multiple recipients", () => {
  test("are announced on the sender line, not hidden by the collapse", () => {
    const rest = atRest(
      render({ toEmails: ["me@example.com", "kelly@corp.example", "ryan@corp.example"] }),
    );
    expect(rest).toContain("to me + 2 others");
  });

  test("say nothing when the message went to one person", () => {
    expect(atRest(render())).not.toContain("other");
  });
});

describe("the Details disclosure", () => {
  test("holds To, Date and Account as a description list", () => {
    const behind = behindDetails(render({ toEmails: ["kelly@corp.example"] }));
    expect(behind).toContain("<dl");
    expect(behind).toMatch(/<dt[^>]*>To<\/dt>/);
    expect(behind).toMatch(/<dt[^>]*>Date<\/dt>/);
    expect(behind).toMatch(/<dt[^>]*>Account<\/dt>/);
    expect(behind).toContain("kelly@corp.example");
    expect(behind).toContain("me@example.com");
    expect(behind).toContain("Jun 3, 2026");
  });

  test("lists every recipient, however many the sender line summarized", () => {
    const behind = behindDetails(
      render({ toEmails: ["me@example.com", "kelly@corp.example", "ryan@corp.example"] }),
    );
    expect(behind).toContain("kelly@corp.example");
    expect(behind).toContain("ryan@corp.example");
  });

  test("dashes the To row when a message has no recipients", () => {
    expect(behindDetails(render({ toEmails: [] }))).toContain("—");
  });

  test("sits on the shared rounded-3xl card, never the old rounded-xl", () => {
    const behind = behindDetails(render());
    expect(behind).toContain("rounded-3xl");
    expect(behind).not.toContain("rounded-xl");
  });

  test("is a pill control with a 40px hit height and press feedback (§3, §5)", () => {
    const html = render();
    const [summary] = summaryClasses(html);
    expect(summary).toBeDefined();
    expect(html).toContain("Details");
    expect(summary).toContain("rounded-full");
    expect(summary).toContain("min-h-10");
    expect(summary).toContain("active:scale-[0.96]");
    expect(summary).not.toContain("transition-all");
  });

  test("is sized to its label rather than spanning the header", () => {
    expect(summaryClasses(render())[0]).not.toContain("w-full");
  });
});

describe("the badge row", () => {
  test("still renders labels and attachments, still interactive", () => {
    const html = render();
    expect(html).toContain("Work");
    expect(html).toContain("quote.pdf");
    expect(html).toContain('aria-label="Remove label Work"');
    expect(html).toContain('aria-label="Attachment quote.pdf"');
  });

  test("renders pending suggestions beside them", () => {
    const html = render({
      latestTriageId: "tr-1",
      triageHistory: [
        {
          id: "tr-1",
          priority: "high",
          reasoning: "quote needs an answer",
          model: null,
          createdAt: "2026-06-03T16:06:00.000Z",
          existingLabelSuggestions: [
            {
              labelId: "l2",
              name: "Vendors",
              colorBg: null,
              colorFg: null,
              status: "pending",
            },
          ],
          newLabelSuggestions: [
            {
              suggestionId: "s1",
              name: "Refrigeration",
              reasoning: null,
              status: "pending",
            },
          ],
        },
      ],
    });
    expect(html).toContain("Vendors");
    expect(html).toContain("Refrigeration");
  });

  test("keeps them on one wrapping row", () => {
    const rest = atRest(render());
    const row = rest.match(/<div class="([^"]*)"><div class="flex flex-wrap/)?.[1];
    expect(row).toBeDefined();
    expect(row).toContain("flex-wrap");
  });
});

describe("thin messages", () => {
  test("render a sender with no name without an empty angle-bracket pair", () => {
    const rest = atRest(render({ fromName: null }));
    expect(rest).toContain("bob@corp.example");
    expect(rest).not.toContain("&lt;&gt;");
    expect(rest).not.toContain("null");
  });

  test("render a message with no subject", () => {
    expect(atRest(render({ subject: null }))).toContain("(no subject)");
  });

  test("render a sender name that is only whitespace as the address", () => {
    const rest = atRest(render({ fromName: "   " }));
    expect(rest).toContain("bob@corp.example");
  });

  // §1: chrome color always comes from a token so it tracks the theme.
  test("hard-code no color for chrome", () => {
    expect(render()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
