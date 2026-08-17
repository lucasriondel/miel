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

const rowAt = (url: string) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <MessageRow message={message} />
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
