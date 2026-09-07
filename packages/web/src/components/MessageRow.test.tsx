import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MessageRow } from "./MessageRow";
import type { ListedMessage } from "../api/types";

// #95. Opening a message used to link to a bare
// `/account/:id/messages/:id`, dropping the inbox's scope. This package has no
// DOM harness, so what is asserted here is the markup: every link out of the
// row carries the same query string the inbox is showing under.

const message: ListedMessage = {
  accountId: "acc-1",
  accountEmail: "a@example.com",
  gmailMessageId: "msg-1",
  gmailThreadId: "th-1",
  fromEmail: "sender@example.com",
  fromName: "Sender",
  toEmails: [],
  subject: "Lunch",
  snippet: "at one",
  internalDate: "2026-08-01T00:00:00.000Z",
  isArchived: false,
  isTrashed: false,
  priority: "high",
  triageId: null,
  labels: [],
  attachments: [],
  pendingSuggestions: { existing: [], new: [] },
};

const rowAt = (url: string, over: Partial<ListedMessage> = {}) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <MessageRow message={{ ...message, ...over }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

/**
 * In-app `href`s only — the row also links out to Gmail, absolute. `&` comes
 * back from the renderer as `&amp;`, which is the same URL to a browser.
 */
const hrefs = (html: string) =>
  [...html.matchAll(/href="(\/[^"]*)"/g)].map(([, href]) => href!.replaceAll("&amp;", "&"));

describe("MessageRow's link into the message", () => {
  test("carries the inbox's view, period and label with it", () => {
    const links = hrefs(rowAt("/account/acc-1?view=month&range=2026-08&label=Label_5"));

    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href).toBe("/account/acc-1/messages/msg-1?view=month&range=2026-08&label=Label_5");
    }
  });

  test("stays bare when the inbox is at its defaults", () => {
    for (const href of hrefs(rowAt("/account/acc-1"))) {
      expect(href).toBe("/account/acc-1/messages/msg-1");
    }
  });

  test("leaves a connect outcome behind rather than re-toasting it", () => {
    for (const href of hrefs(rowAt("/account/acc-1?connected=a%40example.com"))) {
      expect(href).toBe("/account/acc-1/messages/msg-1");
    }
  });
});

// Req. 2: the files a message arrived with are a second line of the row, and it
// exists only when there are files. The row used to show them as a capped run of
// pills clipped to 18 characters, competing with the subject for the same line;
// a line of its own has the width to say the name in full.
const files = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    attachmentId: `att-${i}`,
    filename: `quarterly-refrigeration-quote-${i}.pdf`,
    mimeType: "application/pdf",
    size: 1024,
  }));

describe("the row's attachment line", () => {
  test("names every file, in full, with its size", () => {
    const html = rowAt("/account/acc-1", { attachments: files(4) });

    expect([...html.matchAll(/aria-label="Attachment /g)]).toHaveLength(4);
    expect(html).toContain(">quarterly-refrigeration-quote-0.pdf<");
    expect(html).toContain(">1 KB<");
  });

  test("is absent entirely for a message that carries none", () => {
    expect(rowAt("/account/acc-1")).not.toContain("Attachment ");
  });
});

// Req. 3. `Primary` and `Starred` say nothing on a row: the first is the band
// the row sits in, the second is drawn elsewhere. Only labels a human chose earn
// the width in front of a subject (req. 5).
const label = (id: string, name: string) => ({
  id,
  gmailLabelId: id,
  name,
  colorBg: null,
  colorFg: null,
});

describe("the row's labels", () => {
  test("shows the user's own labels", () => {
    const html = rowAt("/account/acc-1", { labels: [label("l-1", "Keep/Orders")] });

    expect(html).toContain("Keep/Orders");
  });

  test("never renders UNREAD as a badge", () => {
    // Not in `SYSTEM_LABELS` — it is drawn as the row's weight — so the filter
    // has to name it, or it shows up as a label offering to be removed.
    const html = rowAt("/account/acc-1", { labels: [label("l-1", "UNREAD")] });

    expect(html).not.toContain("UNREAD");
  });

  test("never renders Primary or Starred as a badge", () => {
    const html = rowAt("/account/acc-1", {
      labels: [
        label("l-1", "CATEGORY_PERSONAL"),
        label("l-2", "STARRED"),
        label("l-3", "INBOX"),
        label("l-4", "Keep/Orders"),
      ],
    });

    expect(html).not.toContain("Primary");
    expect(html).not.toContain("Starred");
    expect(html).toContain("Keep/Orders");
  });
});

// Req. 1: the priority is the section the row sits under, so the row itself
// carries no dot for it.
describe("the row's priority", () => {
  test("shows no priority dot of its own", () => {
    const html = rowAt("/account/acc-1", { priority: "high" });

    expect(html).not.toContain("priority-dot");
    expect(html.toLowerCase()).not.toContain('aria-label="high priority"');
  });
});
