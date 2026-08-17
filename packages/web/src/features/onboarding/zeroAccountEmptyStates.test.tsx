// The onboarding gate (see {@link ./OnboardingGate}) blocks the whole app while
// zero Gmail accounts are connected, so no surface below it can render with an
// empty account list. What that leaves behind is asserted here: the
// now-unreachable zero-account fallbacks stay gone, and the two things that must
// survive — the settings accounts card and every genuine error state — still
// work.
//
// Rendered into the DOM harness (#129, #134) rather than matched against the
// components' source, which is what this suite used to do. A regex saying
// `AccountPicker.tsx` must not contain "length === 0" pins a spelling: the same
// fallback written as `!data.length` passed it, and a rename broke it with
// nothing changed. Each surface is now handed an empty account list and asked
// what it puts on screen.
//
// The stale-CLI check below is the rendered half of a check that used to walk
// every file under `src`: rendering can only speak for the surfaces it mounts,
// and a surface written next year is exactly the failure mode that scan existed
// for. The repo-wide sweep therefore moved to `uiCopy.test.tsx`, beside the
// vendor-name sweep it is the same kind of check as, and the four surfaces an
// account list of zero can actually reach are asserted here, on screen.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { AccountPicker } from "../../components/AccountPicker";
import { AccountIsland } from "../../components/topbar/AccountIsland";
import { AccountsManager } from "../settings/AccountsManager";
import { AutomaticSyncManager } from "../settings/AutomaticSyncManager";
import { queryKeys } from "../../api/queries";
import type { Account, ScheduleSettings, ScheduleStatus } from "../../api/types";

/**
 * Every request is refused, so a surface that reaches the network is a failure
 * rather than a silent `{}` — and the "failed request" tests below are the one
 * place that refusal is the point.
 */
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> =>
    new Response(
      JSON.stringify({
        error: "accounts_unavailable",
        message: `${String(input)} is unreachable.`,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const SCHEDULE: ScheduleSettings = { enabled: false, intervalMinutes: 15, since: "24h" };
const SCHEDULE_STATUS: ScheduleStatus = {
  enabled: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  isRunning: false,
};

interface Seed {
  /** Left out to leave the accounts query unsettled — it then fails, above. */
  accounts?: Account[];
}

/** The component with the server's answers already in the cache. */
const mount = (ui: ReactElement, seed: Seed = {}) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (seed.accounts) qc.setQueryData(queryKeys.accounts, seed.accounts);
  qc.setQueryData(queryKeys.schedule, SCHEDULE);
  qc.setQueryData(queryKeys.scheduleStatus, SCHEDULE_STATUS);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const accountPicker: ReactElement = <AccountPicker value={undefined} onChange={() => {}} />;
const accountIsland: ReactElement = (
  <AccountIsland selectedAccountId={undefined} onSelectAccount={() => {}} />
);
const accountsCard: ReactElement = <AccountsManager />;
const automaticSyncCard: ReactElement = <AutomaticSyncManager />;

/** Each surface that can be reached with an account list of zero. */
const ZERO_ACCOUNT_SURFACES: Array<{ name: string; ui: ReactElement }> = [
  { name: "the account picker", ui: accountPicker },
  { name: "the topbar account island", ui: accountIsland },
  { name: "the settings accounts card", ui: accountsCard },
  { name: "the automatic-sync card", ui: automaticSyncCard },
];

describe("stale CLI advice", () => {
  test("no surface tells the user to add an account from the CLI", () => {
    // Accounts are connected through in-app Google OAuth; `miel accounts …` has
    // not been the way to add one since that flow landed.
    for (const surface of ZERO_ACCOUNT_SURFACES) {
      const view = mount(surface.ui, { accounts: [] });

      expect(`${surface.name}: ${view.container.textContent}`).not.toMatch(
        /miel accounts|accounts sync/,
      );

      view.unmount();
    }
  });
});

describe("fallbacks the gate makes unreachable", () => {
  test("the account picker offers the list and no empty state", () => {
    mount(<AccountPicker value={undefined} onChange={() => {}} />, { accounts: [] });

    // The legend and an empty radio group: nothing that explains an emptiness
    // the gate does not let the user reach.
    expect(screen.getByRole("group", { name: "Account" })).toBeDefined();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByText(/no accounts/i)).toBeNull();
  });

  test("the topbar account island renders nothing at all", () => {
    const view = mount(<AccountIsland selectedAccountId={undefined} onSelectAccount={() => {}} />, {
      accounts: [],
    });

    // Not an empty-state island — no island. Its remaining guard is for a
    // *failed* accounts request (no list at all), which lands here too.
    expect(view.container.textContent).toBe("");
  });

  test("the automatic-sync card offers the toggle with no accounts connected", () => {
    mount(<AutomaticSyncManager />, { accounts: [] });

    // The schedule is a server-side setting; it does not need an account to be
    // configured, so there is no "no accounts" row standing in front of it.
    expect(screen.getByLabelText("Automatic sync")).toBeDefined();
    expect(screen.queryByText(/no accounts/i)).toBeNull();
  });
});

describe("what must survive", () => {
  test("the settings accounts card keeps its empty state and connect action", () => {
    // This is where a user adds a *second* mailbox, so it is reachable with
    // accounts present and its empty state is not the gate's business.
    mount(<AccountsManager />, { accounts: [] });

    expect(screen.getByText("No accounts yet")).toBeDefined();
    expect(screen.getByRole("button", { name: "Connect with Google" })).toBeDefined();
  });

  test("surviving zero-account copy points at the Google flow", () => {
    mount(<AccountsManager />, { accounts: [] });

    expect(screen.getByText("Connect a Gmail account below to start syncing it.")).toBeDefined();
    expect(
      screen.getByText("Connect another Gmail account with Google to start syncing it."),
    ).toBeDefined();
  });

  test("a failed accounts request still reads as an error, not as empty", async () => {
    // The two surfaces that report a failed accounts request in place — the
    // island has nothing to report it in, and renders nothing instead.
    for (const ui of [accountPicker, accountsCard]) {
      const view = mount(ui);

      await waitFor(() => expect(screen.getByText(/Failed to load accounts/)).toBeDefined());
      expect(screen.queryByText("No accounts yet")).toBeNull();

      view.unmount();
    }
  });
});
