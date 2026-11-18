// Snooze (A13), rendered as a user meets it: the reader's clock, the menu of
// times, the row leaving the inbox and the toast whose Undo wakes it; then the
// Snoozed view — the sidebar's row, the read it makes, the "Until …" a row says
// and the reader's Unsnooze.
//
// `fetch` is the seam, through the real client, so the URL and body asserted
// are the ones the server would receive. Every request the suite has not
// answered for is refused, so a page reaching further fails loudly.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDENTIAL_PROVIDERS } from "@miel/core/providerModels";
import type { Account, ListedMessage, MessageDetail } from "../../api/types";
import { listedMessage } from "../../api/listedMessage.fixture";
import { messageDetail } from "../../api/messageDetail.fixture";

// The real client, put back before the subjects load: a module mock is
// process-global, and this suite's claim is about the request the real client
// builds. See `features/promos/rowPromosWiring.test.tsx`.
const realClient = await import("../../api/client.ts?real");
mock.module("../../api/client", () => ({ ...realClient }));

const { App } = await import("../../App");
const { queryKeys } = await import("../../api/queries");
const { InboxPage } = await import("../../pages/InboxPage");
const { MessageDetailPage } = await import("../../pages/MessageDetailPage");
const { MielToaster } = await import("../../components/MielToaster");
const { TriageActivityProvider } = await import("../../contexts/TriageActivityContext");
const { presetTimeLabel, snoozePresets } = await import("../time/timePresets");

const ACCOUNT_ID = "acc-1";
const SUBJECT = "Quarterly figures";
const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2099-01-01T00:00:00.000Z");
/** A wake time comfortably ahead of any clock this runs on. */
const WAKE = "2099-03-03T08:00:00.000Z";

interface Call {
  method: string;
  url: URL;
  body: unknown;
}

const originalFetch = globalThis.fetch;
let calls: Call[] = [];
/** What `GET /messages` answers, by view. */
let inboxItems: ListedMessage[] = [];
let snoozedItems: ListedMessage[] = [];
let detail: MessageDetail = messageDetail();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  calls = [];
  inboxItems = [];
  snoozedItems = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const path = url.pathname.replace(/^\/api/, "");
    if (path === "/messages/acc-1/msg-1/snooze" && method === "POST") {
      return json({ ok: true, threadId: "th-1", snoozedUntil: (body as { until: string }).until });
    }
    if (path === "/messages/acc-1/msg-1/snooze" && method === "DELETE") {
      snoozedItems = [];
      detail = { ...detail, snoozedUntil: null };
      return json({ ok: true, threadId: "th-1" });
    }
    if (path === "/messages/acc-1/msg-1" && method === "GET") return json(detail);
    if (path === "/messages" && method === "GET") {
      const snoozed = url.searchParams.get("snoozedOnly") === "true";
      return json({ items: snoozed ? snoozedItems : inboxItems, nextCursor: null });
    }
    if (path === "/promo-codes" || path === "/promo-codes/suggested") return json({ items: [] });
    if (path === "/compose/scheduled") return json({ items: [] });
    if (path.endsWith("/labels")) return json({ labels: [] });
    if (path === "/filters") return json({ filters: [], suggestions: [] });
    throw new Error(`unexpected request: ${method} ${url.href}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sent = (method: string, path: string) =>
  calls.filter((c) => c.method === method && c.url.pathname.endsWith(path));

const reader = () => screen.queryByRole("region", { name: "Message" });

describe("snoozing from the reader", () => {
  const layout = {
    selectedAccountId: ACCOUNT_ID,
    selectedLabelId: undefined,
    rangeStartIso: RANGE_START.toISOString(),
    rangeEndIso: RANGE_END.toISOString(),
    range: { start: RANGE_START, end: RANGE_END, key: "2026-08-01", mode: "month" as const },
    isCurrentPeriod: true,
    canGoNext: false,
    goPrev: () => {},
    goNext: () => {},
    goToday: () => {},
    setViewMode: () => {},
    selectedAccountEmail: "a@example.com",
    mailbox: "inbox" as const,
  };

  const mount = () => {
    const row = listedMessage({ subject: SUBJECT, priority: "high" });
    inboxItems = [row];
    detail = messageDetail({ subject: SUBJECT });
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(
      queryKeys.messages({
        accountId: ACCOUNT_ID,
        labelId: undefined,
        internalDateFrom: layout.rangeStartIso,
        internalDateTo: layout.rangeEndIso,
        archivedOnly: undefined,
      }),
      { pages: [{ items: [row], nextCursor: null }], pageParams: [undefined] },
    );
    qc.setQueryData(queryKeys.message(ACCOUNT_ID, "msg-1"), detail);
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/account/acc-1/messages/msg-1"]}>
          <TriageActivityProvider>
            <Routes>
              <Route element={<Outlet context={layout} />}>
                <Route path="/account/:accountId" element={<InboxPage />}>
                  <Route path="messages/:gmailMessageId" element={<MessageDetailPage />} />
                </Route>
              </Route>
            </Routes>
          </TriageActivityProvider>
        </MemoryRouter>
        <MielToaster />
      </QueryClientProvider>,
    );
  };

  test("a preset snoozes until it, the row and the reader leave, and Undo wakes it", async () => {
    mount();
    const toolbar = within(reader()!);
    fireEvent.click(toolbar.getByRole("button", { name: "Snooze" }));

    const menu = await screen.findByRole("menu", { name: "Snooze until" });
    const tomorrow = snoozePresets(new Date()).find((p) => p.id === "tomorrow-morning")!;
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Tomorrow morning/ }));

    // Off the page on the click, like an archive, and the row is gone with it.
    await waitFor(() => expect(reader()).toBeNull());
    expect(screen.queryByText(SUBJECT)).toBeNull();

    await waitFor(() => expect(sent("POST", "/messages/acc-1/msg-1/snooze")).toHaveLength(1));
    expect(sent("POST", "/messages/acc-1/msg-1/snooze")[0]!.body).toEqual({
      until: tomorrow.at.toISOString(),
    });

    const label = presetTimeLabel(tomorrow.at, new Date());
    expect(await screen.findByText(`Snoozed until ${label}`)).toBeDefined();
    fireEvent.click(screen.getAllByRole("button", { name: "Undo" }).at(-1)!);

    await waitFor(() => expect(sent("DELETE", "/messages/acc-1/msg-1/snooze")).toHaveLength(1));
  });

  test("a time in the past is refused in the form, before any request", async () => {
    mount();
    fireEvent.click(within(reader()!).getByRole("button", { name: "Snooze" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Pick date & time…" }));

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "08:00" } });
    const form = within(screen.getByLabelText("Date").closest("form")!);
    fireEvent.click(form.getByRole("button", { name: "Snooze" }));

    expect((await screen.findByRole("alert")).textContent).toContain("already passed");
    expect(sent("POST", "/messages/acc-1/msg-1/snooze")).toHaveLength(0);
    expect(reader()).not.toBeNull();
  });
});

describe("the Snoozed view", () => {
  const ACCOUNT: Account = {
    id: ACCOUNT_ID,
    email: "a@example.com",
    displayName: "You",
    nickname: null,
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSyncedAt: null,
  };

  const mountApp = () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    // Enough for the onboarding gate to stay closed (see `App.test.tsx`).
    qc.setQueryData(queryKeys.googleOAuthConfig, { configured: true, missing: [] });
    qc.setQueryData(queryKeys.accounts, [ACCOUNT]);
    qc.setQueryData(queryKeys.settings, {
      triageProvider: "claude-code",
      triageModel: "claude-haiku-4-5",
      replyProvider: "claude-code",
      replyModel: "claude-haiku-4-5",
      "promo-extractProvider": "claude-code",
      "promo-extractModel": "claude-haiku-4-5",
    });
    qc.setQueryData(queryKeys.claudeCodeToken, { configured: true, hint: "sk-ant-…o4t" });
    for (const vendor of CREDENTIAL_PROVIDERS) {
      qc.setQueryData(queryKeys.providerCredential(vendor), {
        provider: vendor,
        configured: false,
        hint: null,
      });
    }
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/account/acc-1?mailbox=snoozed"]}>
          <Routes>
            <Route path="/" element={<App />}>
              <Route path="account/:accountId" element={<InboxPage />}>
                <Route path="messages/:gmailMessageId" element={<MessageDetailPage />} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
        <MielToaster />
      </QueryClientProvider>,
    );
  };

  test("lists every snoozed thread with when it comes back, and Unsnooze wakes one", async () => {
    snoozedItems = [
      listedMessage({ subject: SUBJECT, priority: "high", isArchived: true, snoozedUntil: WAKE }),
    ];
    detail = messageDetail({ subject: SUBJECT, isArchived: true, snoozedUntil: WAKE });
    mountApp();

    const nav = await screen.findByRole("navigation", { name: "Views" });
    const snoozedLink = within(nav).getByRole("link", { name: /Snoozed/ });
    await waitFor(() => expect(snoozedLink.getAttribute("aria-current")).toBe("page"));
    await waitFor(() => expect(snoozedLink.textContent).toContain("1"));

    // The view's read: snoozed only, and not narrowed to the period on screen.
    const reads = calls.filter(
      (c) => c.url.pathname.endsWith("/messages") && c.url.searchParams.get("snoozedOnly"),
    );
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.url.searchParams.get("snoozedOnly")).toBe("true");
      expect(read.url.searchParams.get("internalDateFrom")).toBeNull();
    }

    const until = `Until ${presetTimeLabel(new Date(WAKE), new Date())}`;
    expect(await screen.findAllByText(until)).not.toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Snoozed" })).toBeDefined();

    fireEvent.click(screen.getAllByRole("link", { name: /Quarterly figures/ })[0]!);
    const notice = await screen.findByRole("region", { name: "Snoozed" });
    expect(notice.textContent).toContain(
      `Snoozed until ${presetTimeLabel(new Date(WAKE), new Date())}`,
    );

    fireEvent.click(within(notice).getByRole("button", { name: "Unsnooze" }));

    await waitFor(() => expect(sent("DELETE", "/messages/acc-1/msg-1/snooze")).toHaveLength(1));
    // Woken: the notice goes, and the row leaves the Snoozed list.
    await waitFor(() => expect(screen.queryByRole("region", { name: "Snoozed" })).toBeNull());
    await waitFor(() => expect(screen.queryByText(until)).toBeNull());
  });

  test("an empty Snoozed view says so", async () => {
    mountApp();
    expect(await screen.findByText("Nothing snoozed")).toBeDefined();
  });
});
