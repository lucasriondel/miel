/**
 * Turning a failed connect round-trip into something a user can act on.
 *
 * The OAuth callback hands back a short code (`?connect_error=…`) — see
 * `googleOAuth.ts` in the API, which emits `access_denied` (or whatever Google
 * sends), `state` and `exchange`. Those are for us, not for the user: this
 * module maps them to plain sentences, and decides *where* the failure belongs.
 *
 * The channel matters because a failed connect with zero accounts drops the
 * user straight back behind the onboarding gate. A toast fades while that
 * blocking dialog stays, leaving a modal that reappeared for no visible reason —
 * so in that case the message goes inside the gate instead.
 */
import { needsConnectStep, type AccountsGateState } from "./onboardingStep";

/** The failure codes the callback raises deliberately. */
export const CONNECT_FAILURE_REASONS = ["access_denied", "state", "exchange"] as const;

const MESSAGES: Record<string, string> = {
  // Google's code for "the user hit Cancel" (and for an admin policy blocking
  // the grant — both come back as a consent that wasn't given).
  access_denied:
    "You didn't grant miel access to your Gmail, so nothing was connected. Connect again and choose Allow to finish.",
  // The flow state is single-use and short-lived: an abandoned tab, a very slow
  // consent screen, or a callback we never issued all land here.
  state: "That sign-in attempt expired before it came back. Starting a fresh one should work.",
  // We got a code from Google but couldn't turn it into an account — token
  // exchange, profile read or the upsert threw.
  exchange:
    "Google signed you in, but miel couldn't finish setting the account up. Trying again usually clears it.",
};

const FALLBACK = "Google couldn't complete the sign-in, so nothing was connected.";

/**
 * A human-readable sentence for a callback failure code. Unknown codes — Google
 * has plenty we don't map — fall back to a plain statement rather than leaking
 * the code into the UI.
 */
export function describeConnectFailure(reason: string): string {
  return MESSAGES[reason] ?? FALLBACK;
}

/**
 * Where a connect failure should be reported.
 *
 * - `hold` — the account list hasn't settled, so we don't yet know whether the
 *   gate is about to open over the app. Wait; nothing is shown meanwhile.
 * - `gate` — zero accounts: the onboarding dialog is up and owns the message.
 * - `toast` — the app is usable behind the failure (or the gate can never open
 *   because the account list itself is broken), so the existing toast is right.
 */
export type ConnectFailureChannel = "hold" | "gate" | "toast";

export function connectFailureChannel(accounts: AccountsGateState): ConnectFailureChannel {
  if (accounts.isPending) return "hold";
  if (needsConnectStep(accounts)) return "gate";
  return "toast";
}
