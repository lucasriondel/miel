/**
 * The four things a fresh install has to have before the app can do its job,
 * in order: a server this page can talk to at all, a server that can reach
 * Google's OAuth endpoints (#120), then a connected mailbox, then a credential
 * for triage to run on (#111).
 */
export type OnboardingStep = "server" | "google-config" | "connect" | "ai";

/** The steps in the order the gate asks them — what the progress row lists. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "server",
  "google-config",
  "connect",
  "ai",
];

/** The parts of a TanStack query this decision reads. */
export interface GateQuery<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}

/**
 * Whether this page can reach its API with the secret it was built with — see
 * `serverCheck.ts`. `ok` is a server that answered; the other two are the two
 * ways it can fail that the operator can do something about.
 */
export type ServerCheckStatus = "ok" | "unauthorized" | "unreachable";
export type ServerCheckGateState = GateQuery<{ status: ServerCheckStatus }>;
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
 * The server check is the one exception that turns a failure into an answer,
 * and it does so itself (`serverCheck.ts`): "the secret was refused" and "nothing
 * answered" are settled facts about the install, not a request still to come,
 * so they arrive here as data. It comes first because no other question can be
 * asked of a server this page cannot talk to.
 *
 * The rest of the order is what the arguments are for. Server configuration
 * comes next because it is the one step the user cannot complete from inside
 * the app: with `GOOGLE_CLIENT_ID` unset there is no consent URL to send anyone
 * to, so asking for a mailbox first would offer a button that can only fail.
 * Then a mailbox — there is nothing to triage without one — and the credential
 * question is only put to an install that has one. "Configured" is whatever that
 * provider's own status route says, so an existing install is not dragged back
 * into onboarding to re-supply a credential it already has.
 */
export function onboardingStep(
  server: ServerCheckGateState,
  googleConfig: GoogleConfigGateState,
  accounts: AccountsGateState,
  triageCredential: TriageCredentialGateState,
): OnboardingStep | null {
  if (server.data && server.data.status !== "ok") return "server";
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
