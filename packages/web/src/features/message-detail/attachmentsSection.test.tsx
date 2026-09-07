// Attachments moved out of the header and under the body (#143).
//
// They used to be pills sharing the header's badge row with the labels, which
// read as metadata about the message and pushed its content down the page by
// however many files had arrived with it. They are now a section of their own
// after `MessageDetailBody`, one row per file on the shared detail surface.
//
// Rendered into the DOM harness (#129): what changed is where a reader finds
// them and what each row says, and the one thing that must not change is what
// an attachment can do — so the menu is opened and its actions fired here.
//
// Two seams, because the two actions take two roads. Sending to worp goes
// through `apiFetch`, which is stubbed in this file's own body: a module mock is
// process-global, so a suite that registers none gets whichever one ran last,
// and this suite's requests would land in another file's recorder. Downloading
// bypasses the client and calls `fetch` itself, so that is stubbed too — and
// both refuse anything they were not asked for, since every render here is
// seeded and a stray request is a bug rather than a fixture.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MessageAttachment, WorpSettings } from "../../api/types";

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

let requests: Array<{ path: string; method: string; body: unknown }> = [];

mock.module("../../api/client", () => ({
  ApiError,
  apiFetch: async (req: { path: string; method?: string; body?: unknown }) => {
    requests.push({ path: req.path, method: req.method ?? "GET", body: req.body });
    if (req.path.endsWith("/send-to-worp")) return { ok: true, result: { filename: "filed.pdf" } };
    throw new ApiError(`unexpected request: ${req.path}`, 500, null);
  },
}));

const { MessageAttachmentsSection } = await import("./MessageAttachmentsSection");
const { MessageDetailPage } = await import("../../pages/MessageDetailPage");
const { messageDetail } = await import("../../api/messageDetail.fixture");
const { queryKeys } = await import("../../api/queries");

/** What `downloadAttachment` asked for — it calls `fetch` rather than the client. */
const originalFetch = globalThis.fetch;
let downloads: string[] = [];

const stubFetch = () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("/attachments/")) throw new Error(`unexpected request: ${url}`);
    downloads.push(url);
    return new Response("%PDF-1.4", { status: 200 });
  }) as typeof fetch;
};

/**
 * Saving a file is an `<a download>` click, and happy-dom honours no download
 * attribute: it navigates the window to the `blob:` URL, which leaves every
 * later request in the file resolving against a `blob:` origin. So the click is
 * recorded rather than performed — the name it would have saved under is worth
 * an assertion of its own anyway.
 */
const originalAnchorClick = HTMLAnchorElement.prototype.click;
let saved: string[] = [];

const QUOTE: MessageAttachment = {
  attachmentId: "att-1",
  filename: "quarterly-refrigeration-quote-2026.pdf",
  mimeType: "application/pdf",
  size: 24_576,
};

const NOTES: MessageAttachment = {
  attachmentId: "att-2",
  filename: "notes.txt",
  mimeType: "text/plain",
  size: 120,
};

const worpSettings = (configured: boolean): WorpSettings => ({
  baseUrl: configured ? "https://worp.example" : "",
  apiKey: { configured, hint: configured ? "wk-1234…9ab" : null },
  extraHeaders: [],
  configured,
});

const newClient = (worpConfigured: boolean) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(queryKeys.worpSettings, worpSettings(worpConfigured));
  return qc;
};

const renderSection = (attachments: MessageAttachment[], worpConfigured = true) =>
  render(
    <QueryClientProvider client={newClient(worpConfigured)}>
      <MessageAttachmentsSection message={messageDetail({ attachments })} />
    </QueryClientProvider>,
  );

/** Each attachment is one menu trigger, named after the file it holds. */
const attachmentButton = (filename: string) =>
  screen.getByRole("button", { name: `Attachment ${filename}` });

const openMenu = async (filename: string) => {
  fireEvent.click(attachmentButton(filename));
  await screen.findByRole("menuitem", { name: "Download" });
};

const menuItems = () =>
  screen.getAllByRole("menuitem").map((item) => item.textContent?.trim() ?? "");

beforeEach(() => {
  requests = [];
  downloads = [];
  saved = [];
  stubFetch();
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    saved.push(this.download);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  HTMLAnchorElement.prototype.click = originalAnchorClick;
});

describe("the attachments section", () => {
  test("gives the files a headed area of their own", () => {
    renderSection([QUOTE]);

    expect(screen.getByRole("heading", { name: /attachments/i })).toBeDefined();
  });

  test("names every file in full, with its type and size", () => {
    renderSection([QUOTE, NOTES]);

    // The header's pill truncated a name past 18 characters; a row has the
    // width to say it, so nothing is cut in the markup.
    expect(screen.getByText(QUOTE.filename)).toBeDefined();
    expect(screen.getByText(NOTES.filename)).toBeDefined();
    expect(screen.getByText(/application\/pdf/)).toHaveProperty(
      "textContent",
      expect.stringContaining("24 KB"),
    );
  });

  test("renders nothing at all for a message with no attachments", () => {
    const { container } = renderSection([]);

    expect(container.innerHTML).toBe("");
  });
});

describe("what an attachment can still do", () => {
  test("offers Download, and Send to worp for a file worp takes", async () => {
    renderSection([QUOTE]);

    await openMenu(QUOTE.filename);

    expect(menuItems()).toEqual(["Download", "Send to worp"]);
  });

  test("offers no relay for a file worp does not take", async () => {
    renderSection([NOTES]);

    await openMenu(NOTES.filename);

    expect(menuItems()).toEqual(["Download"]);
  });

  test("offers no relay at all while worp is unconfigured", async () => {
    renderSection([QUOTE], false);

    await openMenu(QUOTE.filename);

    expect(menuItems()).toEqual(["Download"]);
  });

  test("Download asks the attachment endpoint for this file", async () => {
    renderSection([QUOTE]);
    await openMenu(QUOTE.filename);

    fireEvent.click(screen.getByRole("menuitem", { name: "Download" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toEndWith("/messages/acc-1/msg-1/attachments/att-1");
    // …and hands the browser the file under the name it arrived with.
    await waitFor(() => expect(saved).toEqual([QUOTE.filename]));
  });

  test("Send to worp relays the file under the flow that was picked", async () => {
    renderSection([QUOTE]);
    await openMenu(QUOTE.filename);

    fireEvent.click(screen.getByRole("menuitem", { name: "Send to worp" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "personal" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.path).toBe("/messages/acc-1/msg-1/attachments/att-1/send-to-worp");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.body).toEqual({ flow: "personal" });
  });
});

// The detail page reads nothing off the layout — the top bar is the layout's
// own now, and its controls arrive through `PageTopBar`, which renders them in
// place when no bar is mounted above. An empty context keeps that true: a page
// that started destructuring one would throw here rather than get a stub.
const LAYOUT = {};

/** The whole page, with its message already in the cache so nothing is fetched. */
const renderPage = (attachments: MessageAttachment[]) => {
  const qc = newClient(true);
  const message = messageDetail({ attachments, bodyText: "The quote is attached." });
  qc.setQueryData(queryKeys.message(message.accountId, message.gmailMessageId), message);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[`/account/${message.accountId}/messages/${message.gmailMessageId}`]}
      >
        <Routes>
          <Route path="/" element={<Outlet context={LAYOUT} />}>
            <Route path="account/:accountId" element={<p>Back at the inbox</p>} />
            <Route
              path="account/:accountId/messages/:gmailMessageId"
              element={<MessageDetailPage />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("where the section sits on the page", () => {
  test("after the message body, not in the header above it", () => {
    renderPage([QUOTE]);

    const headings = [...document.querySelectorAll("h1, h2")].map(
      (h) => h.textContent?.trim() ?? "",
    );
    const body = headings.findIndex((text) => text === "Message Body");
    const attachments = headings.findIndex((text) => text.startsWith("Attachments"));

    expect(body).toBeGreaterThanOrEqual(0);
    expect(attachments).toBeGreaterThan(body);
    // And the header — everything above the triage card — no longer names it.
    const header = document.querySelector("header")!;
    expect(header.textContent).not.toContain(QUOTE.filename);
  });
});
