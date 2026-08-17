import { describe, expect, test } from "bun:test";
import { onboardingStep } from "./onboardingStep";

const account = { id: "acc-1" };

const googleConfig = {
  loading: { isPending: true, isError: false, data: undefined },
  neverSettled: { isPending: false, isError: true, data: undefined },
  missing: { isPending: false, isError: false, data: { configured: false } },
  set: { isPending: false, isError: false, data: { configured: true } },
  missingStale: { isPending: false, isError: true, data: { configured: false } },
  setStale: { isPending: false, isError: true, data: { configured: true } },
} as const;

const accounts = {
  loading: { isPending: true, isError: false, data: undefined },
  neverSettled: { isPending: false, isError: true, data: undefined },
  empty: { isPending: false, isError: false, data: [] },
  emptyStale: { isPending: false, isError: true, data: [] },
  connected: { isPending: false, isError: false, data: [account] },
  connectedStale: { isPending: false, isError: true, data: [account] },
} as const;

const credential = {
  loading: { isPending: true, isError: false, data: undefined },
  neverSettled: { isPending: false, isError: true, data: undefined },
  missing: { isPending: false, isError: false, data: { configured: false } },
  stored: { isPending: false, isError: false, data: { configured: true } },
  missingStale: { isPending: false, isError: true, data: { configured: false } },
  storedStale: { isPending: false, isError: true, data: { configured: true } },
} as const;

describe("step one: the server's Google OAuth client", () => {
  test("stays closed while the config request is still loading", () => {
    expect(onboardingStep(googleConfig.loading, accounts.empty, credential.missing)).toBe(null);
  });

  test("stays closed when the config request failed without ever settling", () => {
    expect(onboardingStep(googleConfig.neverSettled, accounts.empty, credential.missing)).toBe(
      null,
    );
  });

  test("opens when the server reports a missing GOOGLE_* variable", () => {
    expect(onboardingStep(googleConfig.missing, accounts.connected, credential.stored)).toBe(
      "google-config",
    );
  });

  test("comes before the mailbox: a connect button with no client can only fail", () => {
    expect(onboardingStep(googleConfig.missing, accounts.empty, credential.missing)).toBe(
      "google-config",
    );
  });

  test("stays open when a background refetch fails over a known-missing config", () => {
    expect(onboardingStep(googleConfig.missingStale, accounts.connected, credential.stored)).toBe(
      "google-config",
    );
  });

  test("does not reopen when a background refetch fails over a known-good config", () => {
    expect(
      onboardingStep(googleConfig.setStale, accounts.connectedStale, credential.storedStale),
    ).toBe(null);
  });
});

describe("step two: connect a Gmail account", () => {
  test("stays closed while the accounts request is still loading", () => {
    expect(onboardingStep(googleConfig.set, accounts.loading, credential.missing)).toBe(null);
  });

  test("stays closed when the accounts request failed without ever settling", () => {
    expect(onboardingStep(googleConfig.set, accounts.neverSettled, credential.missing)).toBe(null);
  });

  test("opens on a settled, genuinely empty account list", () => {
    expect(onboardingStep(googleConfig.set, accounts.empty, credential.stored)).toBe("connect");
  });

  test("stays open when a background refetch fails over a known-empty list", () => {
    // The last settled answer was "no accounts", so the gate must not blink out
    // and hand the user an app with nothing behind it.
    expect(onboardingStep(googleConfig.set, accounts.emptyStale, credential.stored)).toBe(
      "connect",
    );
  });

  test("asks for the mailbox first, even with no AI credential either", () => {
    expect(onboardingStep(googleConfig.set, accounts.empty, credential.missing)).toBe("connect");
  });
});

describe("step three: set up AI triage", () => {
  test("opens once an account exists and the triage provider has no credential", () => {
    expect(onboardingStep(googleConfig.set, accounts.connected, credential.missing)).toBe("ai");
  });

  test("stays closed while the credential request is still loading", () => {
    // Same discipline as the steps before it: never flash a wall over a user
    // who is set up.
    expect(onboardingStep(googleConfig.set, accounts.connected, credential.loading)).toBe(null);
  });

  test("stays closed when the credential request failed without ever settling", () => {
    expect(onboardingStep(googleConfig.set, accounts.connected, credential.neverSettled)).toBe(
      null,
    );
  });

  test("closes once the selected provider has a usable credential", () => {
    expect(onboardingStep(googleConfig.set, accounts.connected, credential.stored)).toBe(null);
  });

  test("stays open when a background refetch fails over a known-missing credential", () => {
    expect(onboardingStep(googleConfig.set, accounts.connected, credential.missingStale)).toBe(
      "ai",
    );
  });

  test("stays closed when a background refetch fails over a known-good credential", () => {
    expect(onboardingStep(googleConfig.set, accounts.connectedStale, credential.storedStale)).toBe(
      null,
    );
  });

  test("does not open over a stale-but-populated account list with a credential", () => {
    expect(onboardingStep(googleConfig.set, accounts.connectedStale, credential.stored)).toBe(null);
  });
});
