/**
 * The three things a fresh install has to have before the app can do its job,
 * in order: a server that can reach Google's OAuth endpoints at all (#120),
 * then a connected mailbox, then a credential for triage to run on (#111).
 */
export type OnboardingStep = "google-config" | "connect" | "ai";

/** The parts of a TanStack query this decision reads. */
export interface GateQuery<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

/** Whether the server has the three `GOOGLE_*` variables the OAuth flow needs. */
export type GoogleConfigGateState = GateQuery<{ configured: boolean }>;
export type AccountsGateState = GateQuery<readonly unknown[]>;
/** Presence of the selected triage provider's credential — a key or a token. */
export type TriageCredentialGateState = GateQuery<{ configured: boolean }>;

/**
 * Which step of the onboarding gate should block the app, or `null` for none.
 *
 * Only *settled* data opens it: while a request is in flight, or when it failed
 * before ever producing an answer, `data` is `undefined` and the gate stays
 * shut — a slow or broken `/accounts` must never flash a "connect an account"
 * wall over a user who has one, and neither must a slow credential lookup.
 *
 * A failed *background refetch* is different: the query keeps its last settled
 * answer, so an empty list keeps the gate open rather than blinking it away to
 * reveal an app with nothing in it. Hence the decision reads `data`, and
 * `isError` only matters through it.
 *
 * The order is what the arguments are for. Server configuration comes first
 * because it is the one step the user cannot complete from inside the app: with
 * `GOOGLE_CLIENT_ID` unset there is no consent URL to send anyone to, so asking
 * for a mailbox first would offer a button that can only fail. Then a mailbox —
 * there is nothing to triage without one — and the credential question is only
 * put to an install that has one. "Configured" is whatever that provider's own
 * status route says, so an existing install is not dragged back into onboarding
 * to re-supply a credential it already has.
 */
export function onboardingStep(
  googleConfig: GoogleConfigGateState,
  accounts: AccountsGateState,
  triageCredential: TriageCredentialGateState,
): OnboardingStep | null {
  if (!googleConfig.data) return null;
  if (!googleConfig.data.configured) return "google-config";
  if (!accounts.data) return null;
  if (needsConnectStep(accounts)) return "connect";
  if (!triageCredential.data) return null;
  return triageCredential.data.configured ? null : "ai";
}

/**
 * Whether the gate is (or would be) on its connect step — a settled account
 * list with nothing in it. Split out because a failed connect has to know where
 * its message will be read, and that is a question about accounts alone
 * (see `connectFailure.ts`).
 */
export function needsConnectStep(accounts: AccountsGateState): boolean {
  return accounts.data !== undefined && accounts.data.length === 0;
}
