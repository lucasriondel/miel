/**
 * The layout's frame (#95, and the redesign's shell).
 *
 * Three things a page relies on the layout for, rendered rather than read off
 * the source: a page's header sits above its own body, which is the content
 * column's one scrolling element (so the header never scrolls away and
 * `useScrollRestoration` has one offset to save); the header leaves with its
 * page; and the offset the body was left at comes back on a history pop, onto
 * the body the page draws again. The decisions inside the restoration itself
 * are `hooks/useScrollRestoration.test.ts`'s.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, useOutletContext } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDENTIAL_PROVIDERS } from "@miel/core/providerModels";
import { App, type LayoutContext } from "./App";
import { queryKeys } from "./api/queries";
import { PageHeader } from "./features/shell/PageHeader";
import { PageLayout } from "./features/shell/PageLayout";
import {
  DEFAULT_VIEW_STORAGE_KEY,
  LAST_ACCOUNT_STORAGE_KEY,
  pinnedAccountPreference,
  readLastAccountId,
  writeDefaultViewPreference,
  writeLastAccountId,
} from "./features/preferences/defaultView";
import type { Account, ClaudeCodeTokenStatus, ModelSettings } from "./api/types";

const originalFetch = globalThis.fetch;

// Every request is refused: the frame is what is under test, and a query that
// reached the network here would be a page reaching past the seeded cache.
beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    throw new Error(`unexpected request: ${String(input)}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.removeItem(DEFAULT_VIEW_STORAGE_KEY);
  localStorage.removeItem(LAST_ACCOUNT_STORAGE_KEY);
});

const ACCOUNT: Account = {
  id: "acc-1",
  email: "you@example.com",
  displayName: "You",
  nickname: null,
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: null,
};
const SETTINGS: ModelSettings = {
  triageProvider: "claude-code",
  triageModel: "claude-haiku-4-5",
  replyProvider: "claude-code",
  replyModel: "claude-haiku-4-5",
  "promo-extractProvider": "claude-code",
  "promo-extractModel": "claude-haiku-4-5",
};
const TOKEN: ClaudeCodeTokenStatus = { configured: true, hint: "sk-ant-…o4t" };

/** Enough in the cache for the onboarding gate to stay closed. */
const seeded = (accounts: Account[] = [ACCOUNT]) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(queryKeys.googleOAuthConfig, { configured: true, missing: [] });
  qc.setQueryData(queryKeys.accounts, accounts);
  qc.setQueryData(queryKeys.settings, SETTINGS);
  qc.setQueryData(queryKeys.claudeCodeToken, TOKEN);
  for (const vendor of CREDENTIAL_PROVIDERS) {
    qc.setQueryData(queryKeys.providerCredential(vendor), {
      provider: vendor,
      configured: false,
      hint: null,
    });
  }
  return qc;
};

/** A page with one control in its header and two links in its body. */
const ProbePage = ({ name }: { name: string }) => {
  const navigate = useNavigate();
  return (
    <PageLayout
      header={
        <PageHeader title={name} trailing={<button type="button">{`${name} action`}</button>} />
      }
    >
      <div style={{ height: 4000 }} data-testid={`${name}-body`}>
        <button type="button" onClick={() => navigate("/settings")}>
          go to settings
        </button>
        <button type="button" onClick={() => navigate(-1)}>
          go back
        </button>
      </div>
    </PageLayout>
  );
};

const renderApp = () =>
  render(
    <QueryClientProvider client={seeded()}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<ProbePage name="inbox" />} />
            <Route path="account/:accountId" element={<ProbePage name="inbox" />} />
            <Route path="settings" element={<ProbePage name="settings" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const scrollRegions = (root: ParentNode) => root.querySelectorAll(".overflow-y-auto");

describe("the layout's frame", () => {
  test("a page's body is the column's one scrolling element, with its header outside it", async () => {
    renderApp();
    const main = await screen.findByRole("main");
    const regions = scrollRegions(main);
    expect(regions).toHaveLength(1);
    const region = regions[0]!;
    expect(region.contains(await screen.findByTestId("inbox-body"))).toBe(true);
    const header = screen.getByRole("heading", { name: "inbox" }).closest("header")!;
    expect(main.contains(header)).toBe(true);
    expect(region.contains(header)).toBe(false);
    expect(header.contains(screen.getByRole("button", { name: "inbox action" }))).toBe(true);
  });

  test("a page's header leaves with its page", async () => {
    renderApp();
    await screen.findByRole("button", { name: "inbox action" });
    fireEvent.click(screen.getByRole("button", { name: "go to settings" }));
    await screen.findByRole("button", { name: "settings action" });
    expect(screen.queryByRole("button", { name: "inbox action" })).toBeNull();
    expect(scrollRegions(screen.getByRole("main"))).toHaveLength(1);
  });

  test("the offset the body was left at comes back on a history pop", async () => {
    renderApp();
    const main = await screen.findByRole("main");
    await screen.findByTestId("inbox-body");
    // happy-dom lays nothing out, and the restore waits for the region to be
    // tall enough to hold the offset before applying it — so give it a height.
    const sized = () => {
      const region = scrollRegions(main)[0] as HTMLElement;
      Object.defineProperty(region, "scrollHeight", { value: 4000, configurable: true });
      Object.defineProperty(region, "clientHeight", { value: 600, configurable: true });
      return region;
    };

    const inbox = sized();
    inbox.scrollTop = 120;
    fireEvent.scroll(inbox);
    fireEvent.click(screen.getByRole("button", { name: "go to settings" }));
    await screen.findByTestId("settings-body");
    expect(sized().scrollTop).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "go back" }));
    await screen.findByTestId("inbox-body");
    const back = sized();
    await waitFor(() => expect(back.scrollTop).toBe(120));
  });
});

const OTHER_ACCOUNT: Account = { ...ACCOUNT, id: "acc-2", email: "other@example.com" };

describe("the Shift+U account shortcut", () => {
  test("switches straight to the next account, never back through the one it left", async () => {
    // Every account the page is rendered for, in order. Setting the layout's
    // state ahead of the URL let the route-sync effect put the old account
    // back for a render before the navigation landed — a visible A→B→A→B.
    const seen: (string | undefined)[] = [];
    const Recorder = () => {
      const { selectedAccountId } = useOutletContext<LayoutContext>();
      if (seen.at(-1) !== selectedAccountId) seen.push(selectedAccountId);
      return <div data-testid={`page-${selectedAccountId}`} />;
    };
    render(
      <QueryClientProvider client={seeded([ACCOUNT, OTHER_ACCOUNT])}>
        <MemoryRouter initialEntries={["/account/acc-1"]}>
          <Routes>
            <Route path="/" element={<App />}>
              <Route path="account/:accountId" element={<Recorder />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId("page-acc-1");

    fireEvent.keyDown(window, { code: "KeyU", key: "U", shiftKey: true });
    await screen.findByTestId("page-acc-2");
    await new Promise((r) => setTimeout(r, 20));

    expect(seen.filter(Boolean)).toEqual(["acc-1", "acc-2"]);
  });

  test("a held key does not keep cycling", async () => {
    render(
      <QueryClientProvider client={seeded([ACCOUNT, OTHER_ACCOUNT])}>
        <MemoryRouter initialEntries={["/account/acc-1"]}>
          <Routes>
            <Route path="/" element={<App />}>
              <Route path="account/:accountId" element={<AccountProbe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId("page-acc-1");
    fireEvent.keyDown(window, { code: "KeyU", key: "U", shiftKey: true, repeat: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("page-acc-1")).toBeTruthy();
  });
});

const AccountProbe = () => {
  const { selectedAccountId } = useOutletContext<LayoutContext>();
  return <div data-testid={`page-${selectedAccountId}`} />;
};

describe("the default view", () => {
  const renderAt = (entry: string) =>
    render(
      <QueryClientProvider client={seeded([ACCOUNT, OTHER_ACCOUNT])}>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/" element={<App />}>
              <Route index element={<AccountProbe />} />
              <Route path="account/:accountId" element={<AccountProbe />} />
              <Route path="settings" element={<AccountProbe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  test("a browser that has never focused an account opens on the first", async () => {
    renderAt("/");
    await screen.findByTestId("page-acc-1");
  });

  test("by default it reopens on the account last looked at", async () => {
    writeLastAccountId("acc-2");
    renderAt("/");
    await screen.findByTestId("page-acc-2");
  });

  test("a pinned account wins over the last one looked at", async () => {
    writeLastAccountId("acc-2");
    writeDefaultViewPreference(pinnedAccountPreference("acc-1"));
    renderAt("/");
    await screen.findByTestId("page-acc-1");
  });

  test("a pinned account that was disconnected falls back to the first", async () => {
    writeDefaultViewPreference(pinnedAccountPreference("gone"));
    writeLastAccountId("acc-2");
    renderAt("/");
    await screen.findByTestId("page-acc-1");
  });

  test("opening an account records it as the last one looked at", async () => {
    renderAt("/account/acc-2");
    await screen.findByTestId("page-acc-2");
    await waitFor(() => expect(readLastAccountId()).toBe("acc-2"));
  });
});
