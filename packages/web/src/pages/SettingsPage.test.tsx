// The Settings page's own structure (`miel.figcraft`, Settings): four tabs under
// the title, the open one named by the URL's `?tab=`, and on the AI tab the
// tasks before the credentials they need.
//
// Rendered into the DOM harness with the api client stubbed and every read the
// page makes seeded in the cache, so a request nobody seeded fails loudly
// rather than answering a silent `{}`.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { CREDENTIAL_PROVIDERS, PROVIDER_LABELS } from "@miel/core/providerModels";
import type { ModelSettings } from "../api/types";

import { SettingsPage } from "./SettingsPage";
import { queryKeys } from "../api/queries";
import { googleOAuthStatus } from "../api/googleOAuthStatus.fixture";

// `fetch` is the seam, not the api client: a module mock is process-global and
// would decide what the client means for every suite loaded after this one.
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    throw new Error(`unexpected request: ${String(input)}`);
  }) as unknown as typeof fetch;
});

const SETTINGS: ModelSettings = {
  triageModel: "claude-haiku-4-5",
  triageProvider: "claude-code",
  replyModel: "claude-sonnet-4-6",
  replyProvider: "claude-code",
  "promo-extractModel": "claude-haiku-4-5",
  "promo-extractProvider": "claude-code",
};

let lastSearch = "";
const LocationProbe = () => {
  lastSearch = useLocation().search;
  return null;
};

const renderAt = (url: string, { token = false } = {}) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(queryKeys.settings, SETTINGS);
  qc.setQueryData(queryKeys.triageBatchSettings, { batchSize: 15, batchConcurrency: 3 });
  qc.setQueryData(queryKeys.claudeCodeToken, { configured: token, hint: token ? "sk-…o4t" : null });
  for (const provider of CREDENTIAL_PROVIDERS) {
    qc.setQueryData(queryKeys.providerCredential(provider), {
      provider,
      configured: false,
      hint: null,
    });
  }
  qc.setQueryData(queryKeys.accounts, []);
  qc.setQueryData(queryKeys.googleOAuthConfig, googleOAuthStatus());
  qc.setQueryData(queryKeys.schedule, { enabled: true, intervalMinutes: 30, since: "24h" });
  qc.setQueryData(queryKeys.scheduleStatus, {
    enabled: true,
    lastStartedAt: null,
    lastFinishedAt: null,
    isRunning: false,
  });
  qc.setQueryData(queryKeys.worpSettings, {
    configured: false,
    baseUrl: "",
    apiKey: { configured: false, hint: null },
    extraHeaders: [],
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="settings"
            element={
              <>
                <SettingsPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const tabs = () => screen.getAllByRole("tab").map((tab) => tab.textContent);
const selected = () => screen.getByRole("tab", { selected: true }).textContent;

afterEach(() => {
  globalThis.fetch = originalFetch;
  lastSearch = "";
});

describe("the tabs", () => {
  test("are General, Mailboxes, AI and Sync, in that order, under the title", () => {
    renderAt("/settings");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Settings");
    expect(tabs()).toEqual(["General", "Mailboxes", "AI", "Sync"]);
  });

  test("open on General when the URL names none — or names one that does not exist", () => {
    for (const url of ["/settings", "/settings?tab=data"]) {
      const view = renderAt(url);
      expect(selected()).toBe("General");
      expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeDefined();
      view.unmount();
    }
  });

  test("open the tab the URL names, so a link can land on one", () => {
    renderAt("/settings?tab=sync");

    expect(selected()).toBe("Sync");
    expect(screen.getByLabelText("Automatic sync")).toBeDefined();
  });

  test("write the open tab back to the URL", () => {
    renderAt("/settings");

    fireEvent.click(screen.getByRole("tab", { name: "Mailboxes" }));

    expect(selected()).toBe("Mailboxes");
    expect(lastSearch).toBe("?tab=mailboxes");
    expect(screen.getByRole("button", { name: "Connect a Gmail account" })).toBeDefined();
  });
});

describe("the AI tab", () => {
  test("lists the tasks before the providers that run them, then batching", () => {
    renderAt("/settings?tab=ai");

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Tasks", "Providers", "Triage batching"]);
  });

  test("carries a row for every provider", () => {
    renderAt("/settings?tab=ai");

    for (const label of Object.values(PROVIDER_LABELS)) {
      expect(screen.getByRole("group", { name: label })).toBeDefined();
    }
  });

  test("says when no credential is stored, before the next sync finds out", () => {
    renderAt("/settings?tab=ai");

    expect(screen.getByText("No AI credential yet")).toBeDefined();
    expect(screen.getByText(/Every task runs on Claude Code by default/)).toBeDefined();
  });

  test("says nothing once every task has what it needs", () => {
    renderAt("/settings?tab=ai", { token: true });

    expect(screen.queryByText("No AI credential yet")).toBeNull();
  });
});

describe("the Sync tab", () => {
  test("keeps the worp relay, which has no tab of its own", () => {
    renderAt("/settings?tab=sync");

    expect(screen.getByRole("heading", { name: "worp relay" })).toBeDefined();
  });
});
