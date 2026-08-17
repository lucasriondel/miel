// A failed Google connect, from the URL the callback lands on to the sentence
// the user reads. What `connectFailure.ts` decides — the wording and the channel
// — has its own suite; this is the wiring around it: the app layout reads the
// outcome off the URL, the gate carries the failure when it is what the user is
// looking at, retrying drops it, and a reload cannot resurface it.
//
// Rendered into the DOM harness (#129, #134) rather than matched against the
// components' source, which is what this suite used to do. `expect(app).toMatch(
// /<OnboardingGate error={gateError}/)` asserted one spelling of one line: it
// broke on a rename and passed on a gate handed the wrong string. The whole
// layout is mounted here instead, at the URL the callback produces.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDENTIAL_PROVIDERS } from "@miel/core/providerModels";
import { App } from "../../App";
import { MielToaster } from "../../components/MielToaster";
import { queryKeys } from "../../api/queries";
import type {
  Account,
  ClaudeCodeTokenStatus,
  GoogleOAuthConfigStatus,
  ModelSettings,
} from "../../api/types";
import { OnboardingGate } from "./OnboardingGate";

const CONSENT_URL = "https://accounts.google.com/o/oauth2/v2/auth?state=abc";

/**
 * `fetch` is the one seam: everything above it is the real thing — the layout,
 * its queries, the gate and the settings rows it borrows. Every request the
 * render has not been seeded for is refused, so a query reaching the network is
 * a failure and not a silent `{}`.
 */
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/auth/google/start")) {
      return new Response(JSON.stringify({ url: CONSENT_URL }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;
});

// The harness runs with main-frame navigation disabled, so `location.assign`
// sets the URL rather than fetching it — and the window is put back where it
// started, since a suite that left it on accounts.google.com would change the
// origin the next file's requests resolve against.
const startedAt = window.location.href;

afterEach(() => {
  globalThis.fetch = originalFetch;
  window.location.href = startedAt;
});

const CONFIGURED: GoogleOAuthConfigStatus = { configured: true, missing: [] };
const ACCOUNT: Account = {
  id: "acc-1",
  email: "you@example.com",
  displayName: "You",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: null,
};
const SETTINGS: ModelSettings = {
  triageProvider: "claude-code",
  triageModel: "claude-haiku-4-5",
  filterProvider: "claude-code",
  filterModel: "claude-haiku-4-5",
  replyProvider: "claude-code",
  replyModel: "claude-haiku-4-5",
};
const STORED_TOKEN: ClaudeCodeTokenStatus = { configured: true, hint: "sk-ant-…o4t" };
const NO_TOKEN: ClaudeCodeTokenStatus = { configured: false, hint: null };

const ACCESS_DENIED = "You didn't grant miel access to your Gmail, so nothing was connected.";

/** The server's answers, already settled, for one install's state. */
const seeded = (accounts: Account[], token: ClaudeCodeTokenStatus) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(queryKeys.googleOAuthConfig, CONFIGURED);
  qc.setQueryData(queryKeys.accounts, accounts);
  qc.setQueryData(queryKeys.settings, SETTINGS);
  qc.setQueryData(queryKeys.claudeCodeToken, token);
  for (const vendor of CREDENTIAL_PROVIDERS) {
    qc.setQueryData(queryKeys.providerCredential(vendor), {
      provider: vendor,
      configured: false,
      hint: null,
    });
  }
  return qc;
};

/** Reports the query string the layout left behind. */
const UrlProbe = () => <output data-testid="search">{useLocation().search}</output>;

/**
 * The whole app layout at the URL the OAuth callback returns to — the gate is
 * mounted by `App` itself, so nothing here decides where a failure goes.
 */
const renderApp = (search: string, accounts: Account[] = []) =>
  render(
    <QueryClientProvider client={seeded(accounts, STORED_TOKEN)}>
      <MemoryRouter initialEntries={[`/${search}`]}>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<UrlProbe />} />
            <Route path="account/:accountId" element={<UrlProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>
      <MielToaster />
    </QueryClientProvider>,
  );

const dialog = () => screen.queryByRole("dialog");

describe("the gate owns the failure", () => {
  test("a failed connect that left zero accounts is read on the connect step", async () => {
    renderApp("?connect_error=access_denied", []);

    // The connect step, since that is where a failure to connect means
    // something — the gate grew a second one in #111.
    await waitFor(() =>
      expect(within(dialog()!).getByText(new RegExp(ACCESS_DENIED))).toBeDefined(),
    );
    expect(within(dialog()!).getByRole("heading").textContent).toBe("Connect a Gmail account");
  });

  test("the failure is announced, and read after the pitch as the dialog's description", async () => {
    renderApp("?connect_error=access_denied", []);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());

    const described = dialog()!.getAttribute("aria-describedby")!.split(" ");

    // aria-describedby takes a list: the pitch, then why the last try didn't
    // take.
    expect(described).toHaveLength(2);
    expect(document.getElementById(described[0]!)!.textContent).toContain(
      "Connect a Google account to get started.",
    );
    expect(described[1]).toBe(screen.getByRole("alert").id);
  });

  test("the description names only the pitch on a step with no failure to show", () => {
    // The gate's other steps have nothing to say about a connect that failed,
    // so nothing points at a notice they do not render.
    render(
      <QueryClientProvider client={seeded([ACCOUNT], NO_TOKEN)}>
        <OnboardingGate error={ACCESS_DENIED} />
      </QueryClientProvider>,
    );

    expect(within(dialog()!).getByRole("heading").textContent).toBe("Set up AI triage");
    expect(dialog()!.getAttribute("aria-describedby")!.split(" ")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(new RegExp(ACCESS_DENIED))).toBeNull();
  });

  test("the notice does not fade on a timer, and offers nothing to dismiss it", async () => {
    renderApp("?connect_error=access_denied", []);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());

    // The gate reopens the moment a failed connect returns with zero accounts,
    // so the message has to still be there when the user looks at it. Nothing
    // schedules its removal, and nothing offers to.
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(screen.getByRole("alert").textContent).toContain(ACCESS_DENIED);
    expect(within(dialog()!).queryByRole("button", { name: /dismiss|close|got it/i })).toBeNull();
  });

  test("retrying drops the stale message and sends the browser back to Google", async () => {
    renderApp("?connect_error=access_denied", []);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeNull());

    fireEvent.click(within(dialog()!).getByRole("button", { name: "Connect with Google" }));

    // The failure goes with the attempt that replaces it — and the gate stays,
    // since there is still no account behind it.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(dialog()).not.toBeNull();
    await waitFor(() => expect(window.location.href).toBe(CONSENT_URL));
  });
});

describe("where the failure is reported", () => {
  test("with a mailbox already connected it is a toast, not the gate", async () => {
    renderApp("?connect_error=access_denied", [ACCOUNT]);

    // The app is usable behind the failure, so the gate never opens and the
    // existing toast is the right place for it.
    await waitFor(() => expect(screen.getByText(new RegExp(ACCESS_DENIED))).toBeDefined());
    expect(dialog()).toBeNull();
  });

  test("an unmapped code is reported in plain English, never quoted back", async () => {
    // Google has plenty of codes we don't map; none of them is copy.
    renderApp("?connect_error=admin_policy_enforced_9000", []);

    await waitFor(() =>
      expect(
        screen.getByText("Google couldn't complete the sign-in, so nothing was connected."),
      ).toBeDefined(),
    );
    expect(document.body.textContent).not.toContain("admin_policy_enforced_9000");
  });

  test("the outcome params are stripped, so a reload can't resurface it", async () => {
    renderApp("?connect_error=access_denied&label=INBOX", []);

    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe("?label=INBOX"));
    // The message is already on screen; it lives in state, not in the URL.
    expect(screen.getByRole("alert").textContent).toContain(ACCESS_DENIED);
  });
});
