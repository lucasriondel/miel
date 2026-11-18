// Naming a mailbox in miel (`PATCH /accounts/:id`): a Rename on its Settings
// row opens the name line in place — Enter saves, Escape leaves, an emptied box
// clears — and a nickname, once set, is the row's first line with the address
// under it. Gmail is never told.
//
// Rendered with `fetch` as the seam, so the body asserted is the one the real
// client sends; every request no test answered is refused.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "../../api/queries";
import type { Account } from "../../api/types";
import { AccountsManager } from "./AccountsManager";

const ACCOUNT: Account = {
  id: "acc-1",
  email: "lucas@example.com",
  displayName: "Lucas R",
  nickname: null,
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: null,
};

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

const sent: Sent[] = [];
/** What `GET /accounts` answers after a write — the server's own trim. */
let stored: Account = ACCOUNT;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  sent.length = 0;
  stored = ACCOUNT;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const req: Sent = {
      method: init?.method ?? "GET",
      path: url.pathname.replace(/^\/api/, ""),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    sent.push(req);
    if (req.method === "PATCH" && req.path === `/accounts/${ACCOUNT.id}`) {
      stored = { ...stored, nickname: (req.body as { nickname: string | null }).nickname };
      return new Response(JSON.stringify({ account: stored }));
    }
    if (req.method === "GET" && req.path === "/accounts") {
      return new Response(JSON.stringify({ accounts: [stored] }));
    }
    throw new Error(`unexpected request: ${req.method} ${req.path}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const renderRows = (account: Account = ACCOUNT) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(queryKeys.accounts, [account]);
  render(
    <QueryClientProvider client={qc}>
      <AccountsManager />
    </QueryClientProvider>,
  );
};

const nameBox = () => screen.getByLabelText<HTMLInputElement>("Mailbox nickname");
const patches = () => sent.filter((r) => r.method === "PATCH");

describe("renaming a mailbox", () => {
  test("Enter saves the typed name, and the row then leads with it", async () => {
    renderRows();

    fireEvent.click(screen.getByRole("button", { name: "Rename mailbox" }));
    fireEvent.change(nameBox(), { target: { value: "  Lucas — Pro " } });
    fireEvent.keyDown(nameBox(), { key: "Enter" });

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual({
      method: "PATCH",
      path: "/accounts/acc-1",
      body: { nickname: "Lucas — Pro" },
    });
    await waitFor(() => expect(screen.queryByLabelText("Mailbox nickname")).toBeNull());
    expect(await screen.findByText("Lucas — Pro")).toBeDefined();
    expect(screen.getByText("lucas@example.com")).toBeDefined();
  });

  test("an emptied box clears the nickname", async () => {
    renderRows({ ...ACCOUNT, nickname: "Pro" });

    fireEvent.click(screen.getByRole("button", { name: "Rename mailbox" }));
    expect(nameBox().value).toBe("Pro");
    fireEvent.change(nameBox(), { target: { value: "   " } });
    fireEvent.keyDown(nameBox(), { key: "Enter" });

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ nickname: null });
  });

  test("Escape leaves without a request", () => {
    renderRows();

    fireEvent.click(screen.getByRole("button", { name: "Rename mailbox" }));
    fireEvent.change(nameBox(), { target: { value: "Never mind" } });
    fireEvent.keyDown(nameBox(), { key: "Escape" });

    expect(screen.queryByLabelText("Mailbox nickname")).toBeNull();
    expect(patches()).toHaveLength(0);
  });

  test("caps the name at the server's sixty characters", () => {
    renderRows();

    fireEvent.click(screen.getByRole("button", { name: "Rename mailbox" }));
    expect(nameBox().maxLength).toBe(60);
  });
});

describe("a row with no nickname", () => {
  test("leads with the address and names the Google account under it", () => {
    renderRows();

    const row = screen.getByText("lucas@example.com").parentElement!.parentElement!;
    expect(within(row).getByText("Lucas R")).toBeDefined();
  });
});
