// The Google OAuth client on Settings › Mailboxes (A15): what is in effect,
// where it comes from, and the two writes — an edit through the same form the
// onboarding gate draws, and forgetting a client saved in miel.
//
// Rendered into the DOM harness with `fetch` as the seam, so the URL, verb and
// body a click sends are the ones the real client builds; every request no
// test answered is refused.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { googleOAuthStatus } from "../../api/googleOAuthStatus.fixture";
import { queryKeys } from "../../api/queries";
import type { GoogleOAuthConfigStatus, GoogleOAuthSaveResult } from "../../api/types";
import { MielToaster } from "../../components/MielToaster";
import { GoogleClientCard } from "./GoogleClientCard";

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

const sent: Sent[] = [];
let reply: (req: Sent) => unknown = () => undefined;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  sent.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const req: Sent = {
      method: init?.method ?? "GET",
      path: url.pathname.replace(/^\/api/, ""),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    sent.push(req);
    const body = reply(req);
    if (body === undefined) throw new Error(`unexpected request: ${req.method} ${req.path}`);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  reply = () => undefined;
});

const SAVED = googleOAuthStatus({
  source: "database",
  secretHint: "GOCSPX…a1b",
  accountsToReconnect: 2,
});

const renderCard = (status: GoogleOAuthConfigStatus) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(queryKeys.googleOAuthConfig, status);
  qc.setQueryData(queryKeys.accounts, []);
  render(
    <QueryClientProvider client={qc}>
      <GoogleClientCard />
      <MielToaster />
    </QueryClientProvider>,
  );
};

const card = () => within(screen.getByRole("region", { name: "Google OAuth client" }));
const writes = () => sent.filter((r) => r.method !== "GET");
const result = (status: GoogleOAuthConfigStatus, reconnectRequired = 0): GoogleOAuthSaveResult => ({
  ...status,
  clientChanged: reconnectRequired > 0,
  reconnectRequired,
});

describe("what is in effect", () => {
  test("a client from the server's environment: its ID, where it lives, and nothing to forget", () => {
    renderCard(googleOAuthStatus());

    expect(card().getByText("1234-abc.apps.googleusercontent.com")).toBeDefined();
    expect(card().getByText("From the server environment")).toBeDefined();
    expect(card().getByText("Kept on the server, never shown here.")).toBeDefined();
    expect(card().queryByRole("button", { name: "Forget" })).toBeNull();
  });

  test("a client saved in miel shows its masked secret", () => {
    renderCard(SAVED);

    expect(card().getByText("Saved in miel")).toBeDefined();
    expect(card().getByText("GOCSPX…a1b")).toBeDefined();
  });
});

describe("editing", () => {
  test("the same client keeps its stored secret when the box is left empty", async () => {
    reply = (req) => (req.method === "PUT" ? result(SAVED) : SAVED);
    renderCard(SAVED);

    fireEvent.click(card().getByRole("button", { name: "Edit" }));
    expect(card().getByLabelText<HTMLInputElement>("Client secret").placeholder).toContain(
      "GOCSPX…a1b",
    );
    fireEvent.change(card().getByLabelText("Redirect URI"), {
      target: { value: "https://new.example.com/api/auth/google/callback" },
    });
    fireEvent.click(card().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: "PUT",
      path: "/settings/google-oauth",
      body: {
        clientId: "1234-abc.apps.googleusercontent.com",
        redirectUri: "https://new.example.com/api/auth/google/callback",
      },
    });
    // The form folds back to the summary once the server has it.
    await waitFor(() => expect(card().queryByLabelText("Client ID")).toBeNull());
  });

  test("a different client warns how many mailboxes it disconnects, and saves on the second press", async () => {
    const other = { ...SAVED, clientId: "9999-new.apps.googleusercontent.com" };
    reply = (req) => (req.method === "PUT" ? result(other, 2) : other);
    renderCard(SAVED);

    fireEvent.click(card().getByRole("button", { name: "Edit" }));
    fireEvent.change(card().getByLabelText("Client ID"), {
      target: { value: "9999-new.apps.googleusercontent.com" },
    });
    fireEvent.change(card().getByLabelText("Client secret"), {
      target: { value: "GOCSPX-other" },
    });
    fireEvent.click(card().getByRole("button", { name: "Save" }));

    expect(card().getByText("This disconnects 2 mailboxes; each has to reconnect.")).toBeDefined();
    expect(writes()).toHaveLength(0);

    fireEvent.click(card().getByRole("button", { name: "Save anyway" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]!.body).toEqual({
      clientId: "9999-new.apps.googleusercontent.com",
      clientSecret: "GOCSPX-other",
      redirectUri: SAVED.redirectUri,
    });
    expect(
      await screen.findByText("2 mailboxes were disconnected; each has to reconnect."),
    ).toBeDefined();
  });

  test("a different ID cannot borrow the stored secret", () => {
    renderCard(SAVED);

    fireEvent.click(card().getByRole("button", { name: "Edit" }));
    fireEvent.change(card().getByLabelText("Client ID"), {
      target: { value: "9999-new.apps.googleusercontent.com" },
    });

    expect(card().getByRole<HTMLButtonElement>("button", { name: "Save" }).disabled).toBe(true);
  });
});

describe("forgetting", () => {
  test("asks in place, then deletes the stored client", async () => {
    const fallback = googleOAuthStatus();
    reply = (req) => (req.method === "DELETE" ? result(fallback) : fallback);
    renderCard(SAVED);

    fireEvent.click(card().getByRole("button", { name: "Forget" }));
    expect(card().getByText("This disconnects 2 mailboxes; each has to reconnect.")).toBeDefined();
    expect(writes()).toHaveLength(0);

    fireEvent.click(card().getByRole("button", { name: "Forget" }));

    await waitFor(() =>
      expect(writes()).toEqual([
        { method: "DELETE", path: "/settings/google-oauth", body: undefined },
      ]),
    );
    await waitFor(() => expect(card().getByText("From the server environment")).toBeDefined());
  });
});
