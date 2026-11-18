// The Scheduled page (A12), rendered: what miel is holding to send, a pending
// send cancelled and moved, a failed one retried, and the refusal a send
// already on its way answers with. `fetch` is the seam, through the real
// client; anything the suite has not answered for is refused.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ScheduledSendView } from "../../api/types";

// The real client, put back before the subjects load — see
// `features/promos/rowPromosWiring.test.tsx` for why.
const realClient = await import("../../api/client.ts?real");
mock.module("../../api/client", () => ({ ...realClient }));

const { ScheduledPage } = await import("../../pages/ScheduledPage");
const { MielToaster } = await import("../../components/MielToaster");
const { schedulePresets } = await import("../time/timePresets");

const send = (over: Partial<ScheduledSendView> = {}): ScheduledSendView => ({
  id: "s-1",
  accountId: "acc-1",
  kind: "new",
  sourceGmailMessageId: null,
  sendAt: "2099-03-03T08:00:00.000Z",
  status: "pending",
  attempts: 0,
  error: null,
  sentAt: null,
  sentMessageId: null,
  threadId: null,
  to: ["ana@example.com"],
  cc: [],
  bcc: [],
  subject: "Contract draft",
  preview: "Here is the draft we discussed",
  attachmentCount: 2,
  createdAt: "2026-11-18T10:00:00.000Z",
  ...over,
});

interface Call {
  method: string;
  url: URL;
  body: unknown;
}

const originalFetch = globalThis.fetch;
let calls: Call[] = [];
let items: ScheduledSendView[] = [];
/** Set to make a cancel answer the way the server does once a send has started. */
let cancelInFlight = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  calls = [];
  items = [];
  cancelInFlight = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const path = url.pathname.replace(/^\/api/, "");
    if (path === "/compose/scheduled" && method === "GET") return json({ items });
    const one = /^\/compose\/scheduled\/([^/]+)$/.exec(path);
    if (one && method === "DELETE") {
      if (cancelInFlight) {
        return json(
          { error: "scheduled_not_editable", message: "That send has already started." },
          409,
        );
      }
      const gone = items.find((i) => i.id === one[1])!;
      items = items.filter((i) => i.id !== one[1]);
      return json({ ...gone, status: "cancelled" });
    }
    if (one && method === "PATCH") {
      const sendAt = (body as { sendAt: string }).sendAt;
      items = items.map((i) =>
        i.id === one[1] ? { ...i, sendAt, status: "pending", error: null } : i,
      );
      return json(items.find((i) => i.id === one[1]));
    }
    throw new Error(`unexpected request: ${method} ${url.href}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const mount = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={["/account/acc-1/scheduled"]}>
        <Routes>
          <Route path="/account/:accountId/scheduled" element={<ScheduledPage />} />
        </Routes>
      </MemoryRouter>
      <MielToaster />
    </QueryClientProvider>,
  );

const list = () => screen.findByRole("list", { name: "Scheduled mail" });
const row = (name: RegExp) => within(screen.getByRole("listitem", { name }));
const sent = (method: string) => calls.filter((c) => c.method === method);

describe("the Scheduled page", () => {
  test("lists the account's sends with who, what and when", async () => {
    items = [
      send(),
      send({ id: "s-2", status: "failed", error: "Gmail refused: invalid To", subject: "Invoice" }),
    ];
    mount();

    await list();
    const read = sent("GET")[0]!;
    expect(read.url.pathname).toEndWith("/compose/scheduled");
    expect(read.url.searchParams.get("account")).toBe("acc-1");

    const pending = row(/Contract draft/);
    expect(pending.getByText("To ana@example.com")).toBeDefined();
    expect(pending.getByText("· Here is the draft we discussed", { exact: false })).toBeDefined();
    expect(pending.getByTitle("2 attachments")).toBeDefined();
    expect(pending.getByText("Scheduled")).toBeDefined();

    const failed = row(/Invoice/);
    expect(failed.getByText("Gmail refused: invalid To")).toBeDefined();
    expect(failed.getByRole("button", { name: "Retry" })).toBeDefined();
    expect(failed.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  test("Cancel deletes a pending send, says so, and the row goes", async () => {
    items = [send()];
    mount();
    await list();

    fireEvent.click(row(/Contract draft/).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(sent("DELETE")).toHaveLength(1));
    expect(sent("DELETE")[0]!.url.pathname).toEndWith("/compose/scheduled/s-1");
    expect(await screen.findByText("Scheduled send cancelled")).toBeDefined();
    expect(await screen.findByText("Nothing scheduled")).toBeDefined();
  });

  test("a send already on its way cannot be cancelled, and says so", async () => {
    items = [send()];
    cancelInFlight = true;
    mount();
    await list();

    fireEvent.click(row(/Contract draft/).getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("It is already being sent")).toBeDefined();
  });

  test("Change time moves a pending send to the preset picked", async () => {
    items = [send()];
    mount();
    await list();

    fireEvent.click(row(/Contract draft/).getByRole("button", { name: "Change time" }));
    const menu = await screen.findByRole("menu", { name: "Change time" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Monday morning/ }));

    const monday = schedulePresets(new Date()).find((p) => p.id === "monday-morning")!;
    await waitFor(() => expect(sent("PATCH")).toHaveLength(1));
    expect(sent("PATCH")[0]!.body).toEqual({ sendAt: monday.at.toISOString() });
  });

  test("Retry gives a failed send another go", async () => {
    items = [send({ status: "failed", error: "Gmail refused: invalid To" })];
    mount();
    await list();

    fireEvent.click(row(/Contract draft/).getByRole("button", { name: "Retry" }));
    const menu = await screen.findByRole("menu", { name: "Retry" });
    const before = Date.now();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Right away/ }));

    await waitFor(() => expect(sent("PATCH")).toHaveLength(1));
    const patch = sent("PATCH")[0]!;
    expect(patch.url.pathname).toEndWith("/compose/scheduled/s-1");
    const sendAt = new Date((patch.body as { sendAt: string }).sendAt).getTime();
    expect(sendAt).toBeGreaterThan(before);
    // The re-read shows it pending again, its error gone.
    await waitFor(() => expect(screen.queryByText("Gmail refused: invalid To")).toBeNull());
    expect(row(/Contract draft/).getByText("Scheduled")).toBeDefined();
  });
});
