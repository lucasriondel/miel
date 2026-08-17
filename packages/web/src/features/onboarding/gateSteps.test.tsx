// The gate as a user meets it (#111, #120): three ordered steps, the one on
// screen being the first unanswered question, and no way past any of them.
//
// Rendered into the DOM harness (#129) rather than matched against the
// component's source, which is what this suite used to do. A regex over
// `OnboardingGate.tsx` asserts spelling: a rename broke it with no behaviour
// changed, and a gate wired to the wrong query could still pass it. What the
// pure `onboardingStep` decides is tested next door; this is the wiring — the
// right step is shown, the server's own answers reach it, and the dialog cannot
// be got past.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDENTIAL_PROVIDERS } from "@miel/core/providerModels";
import type {
  Account,
  ClaudeCodeTokenStatus,
  CredentialProvider,
  GoogleOAuthConfigStatus,
  ModelSettings,
} from "../../api/types";

/**
 * The one seam stubbed: the api client, which is where this render would leave
 * the process. Everything above it is the real thing — the gate, its queries,
 * the settings rows it borrows.
 *
 * Registered in the file body, with the modules under test imported after it,
 * for the reason `googleOAuth.test.ts` gives: a module mock is process-global,
 * so whichever suite mocked `./client` last owns it here unless this file
 * registers its own. Every request the render has not been seeded for is
 * refused, so a query reaching the network is a failure and not a silent `{}`.
 */
const requested: Array<{ path: string; query?: Record<string, unknown> }> = [];
const CONSENT_URL = "https://accounts.google.com/o/oauth2/v2/auth?state=abc";
mock.module("../../api/client", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: async (req: { path: string; query?: Record<string, unknown> }) => {
    requested.push(req);
    if (req.path === "/auth/google/start") return { url: CONSENT_URL };
    throw new Error(`unexpected request: ${req.path}`);
  },
}));

const { OnboardingGate } = await import("./OnboardingGate");
const { queryKeys } = await import("../../api/queries");

const CONFIGURED: GoogleOAuthConfigStatus = { configured: true, missing: [] };
const UNCONFIGURED: GoogleOAuthConfigStatus = {
  configured: false,
  missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
};

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

interface Seed {
  /** Left out to leave that query unsettled — the gate must stay shut on it. */
  googleConfig?: GoogleOAuthConfigStatus;
  accounts?: Account[];
  settings?: ModelSettings;
  token?: ClaudeCodeTokenStatus;
  /** The one vendor whose key differs from "not stored". */
  key?: CredentialProvider;
}

/**
 * The gate with the server's answers already in the cache. `staleTime` is
 * infinite so a seeded query is not refetched behind the render; anything left
 * unseeded is refused by the client above and so never settles, which is
 * precisely the state the "still unknown" test is about.
 */
const renderGate = (seed: Seed, props: { error?: string; onRetry?: () => void } = {}) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (seed.googleConfig) qc.setQueryData(queryKeys.googleOAuthConfig, seed.googleConfig);
  if (seed.accounts) qc.setQueryData(queryKeys.accounts, seed.accounts);
  if (seed.settings) qc.setQueryData(queryKeys.settings, seed.settings);
  if (seed.token) qc.setQueryData(queryKeys.claudeCodeToken, seed.token);
  // The AI step's credential grid reads every vendor, and one left in flight
  // would disable the provider select rather than be left out of it.
  for (const vendor of CREDENTIAL_PROVIDERS) {
    qc.setQueryData(queryKeys.providerCredential(vendor), {
      provider: vendor,
      configured: vendor === seed.key,
      hint: vendor === seed.key ? "sk-…3f9" : null,
    });
  }
  return render(
    <QueryClientProvider client={qc}>
      <OnboardingGate {...props} />
    </QueryClientProvider>,
  );
};

/** A fresh install past the first two steps, with triage still uncredentialed. */
const AT_AI_STEP: Seed = {
  googleConfig: CONFIGURED,
  accounts: [ACCOUNT],
  settings: SETTINGS,
  token: NO_TOKEN,
};
const AT_CONNECT_STEP: Seed = {
  googleConfig: CONFIGURED,
  accounts: [],
  settings: SETTINGS,
  token: NO_TOKEN,
};
const AT_CONFIG_STEP: Seed = { ...AT_CONNECT_STEP, googleConfig: UNCONFIGURED };

// The harness runs with main-frame navigation disabled, so `location.assign`
// sets the URL rather than fetching it — and the window is put back where it
// started, since a suite that left it on accounts.google.com would change the
// origin the next file's requests resolve against.
const startedAt = window.location.href;

afterEach(() => {
  window.location.href = startedAt;
  requested.length = 0;
});

const dialog = () => within(screen.getByRole("dialog"));

describe("which step the gate opens on", () => {
  test("asks for the server's Google OAuth client before anything else", () => {
    renderGate(AT_CONFIG_STEP);

    expect(dialog().getByRole("heading").textContent).toBe("Finish the server setup");
    // The server's own list of names, not a fixed three guessed here.
    expect(dialog().getByText("GOOGLE_CLIENT_ID")).toBeDefined();
    expect(dialog().getByText("GOOGLE_CLIENT_SECRET")).toBeDefined();
    expect(dialog().queryByText("GOOGLE_REDIRECT_URI")).toBeNull();
  });

  test("asks for a mailbox once the server can sign someone in", () => {
    renderGate(AT_CONNECT_STEP);

    expect(dialog().getByRole("heading").textContent).toBe("Connect a Gmail account");
    expect(dialog().getByRole("button", { name: "Connect with Google" })).toBeDefined();
  });

  test("asks for triage's credential once a mailbox is connected", () => {
    renderGate(AT_AI_STEP);

    expect(dialog().getByRole("heading").textContent).toBe("Set up AI triage");
    expect(dialog().getByLabelText<HTMLSelectElement>("Triage provider").value).toBe("claude-code");
  });

  test("lets go once all three are answered", () => {
    renderGate({ ...AT_AI_STEP, token: STORED_TOKEN });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("asks about the credential of the provider the settings point triage at", () => {
    const onAnthropic: Seed = {
      ...AT_AI_STEP,
      settings: { ...SETTINGS, triageProvider: "anthropic" },
    };

    // The local token being absent says nothing about a vendor that runs over
    // HTTP, so a stored Anthropic key is what closes this.
    const view = renderGate({ ...onAnthropic, key: "anthropic" });
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();

    renderGate({ ...onAnthropic, key: "openai" });
    expect(dialog().getByRole("heading").textContent).toBe("Set up AI triage");
  });

  test("shows nothing while an answer is still unknown", () => {
    // Settled data only: a slow /accounts must never flash a "connect an
    // account" wall over an install that has one.
    renderGate({ googleConfig: CONFIGURED, settings: SETTINGS, token: NO_TOKEN });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("marks which of the three steps the user is on", () => {
    renderGate(AT_AI_STEP);

    const marked = dialog()
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("aria-current") === "step");
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("Set up AI triage");
  });
});

describe("no way past it", () => {
  test("Escape does not close it", () => {
    renderGate(AT_AI_STEP);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  test("clicking the backdrop does not close it", () => {
    renderGate(AT_CONNECT_STEP);
    const backdrop = screen.getByRole("dialog").parentElement!;

    fireEvent.mouseDown(backdrop);

    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  test("offers no skip, close or do-it-later control on any step", () => {
    for (const seed of [AT_CONFIG_STEP, AT_CONNECT_STEP, AT_AI_STEP]) {
      const view = renderGate(seed);

      expect(
        dialog().queryByRole("button", { name: /skip|not now|maybe later|dismiss|close/i }),
      ).toBeNull();

      view.unmount();
    }
  });

  test("the config step asks for nothing — those variables are the server's own", () => {
    renderGate(AT_CONFIG_STEP);

    // Nothing to press and nothing to paste: the work happens outside the app,
    // so naming what is missing is the whole of what the browser can do.
    expect(dialog().queryAllByRole("button")).toHaveLength(0);
    expect(dialog().queryAllByRole("textbox")).toHaveLength(0);
  });
});

describe("the connect step", () => {
  test("carries the last failure, since the toast that reported it is behind the gate", () => {
    renderGate(AT_CONNECT_STEP, { error: "Google said no." });

    expect(dialog().getByText("Google said no.")).toBeDefined();
  });

  test("sends the browser to Google's consent screen, and drops the stale failure", async () => {
    let retried = 0;
    renderGate(AT_CONNECT_STEP, { error: "Google said no.", onRetry: () => retried++ });

    fireEvent.click(dialog().getByRole("button", { name: "Connect with Google" }));

    await waitFor(() => expect(window.location.href).toBe(CONSENT_URL));
    // Back to the inbox of the account just connected, not to settings.
    expect(requested).toEqual([{ path: "/auth/google/start", query: { return: "inbox" } }]);
    // The stale failure goes with the attempt that replaces it.
    expect(retried).toBe(1);
  });
});

describe("the AI step", () => {
  test("configures triage and no other task", () => {
    renderGate(AT_AI_STEP);

    // Three model choices before the user has seen a single message is a worse
    // first run than one; filters and replies keep their defaults.
    expect(dialog().getByLabelText("Triage provider")).toBeDefined();
    expect(dialog().queryByLabelText("Reply provider")).toBeNull();
    expect(dialog().queryByLabelText("Filter provider")).toBeNull();
  });

  test("asks for the credential in the step that needs one", () => {
    renderGate(AT_AI_STEP);

    // The settings page's own grid, so a provider gains a credential here the
    // same way it does there.
    expect(dialog().getByLabelText("Claude Code token")).toBeDefined();
    expect(dialog().getAllByLabelText(/ API key$/)).toHaveLength(CREDENTIAL_PROVIDERS.length);
  });
});
