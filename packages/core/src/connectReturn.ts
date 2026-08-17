/**
 * Where the browser lands after the in-app Google OAuth round-trip.
 *
 * The consent + callback hop happens outside the SPA, so the page the connect
 * started from can't be recovered from the browser on the way back. The web
 * names its origin when it asks for a consent URL, the API remembers it beside
 * the CSRF `state`, and the callback resolves the landing spot from that
 * server-side record — never from anything the callback URL carries. Targets
 * are therefore a small closed set of in-app locations rather than free-form
 * URLs: a crafted callback can at worst pick between the pages below, and an
 * unknown or absent value falls back to {@link DEFAULT_CONNECT_RETURN_TARGET}.
 *
 * A leaf module (only `./appBasePath`), so the web can import it as
 * `@miel/core/connectReturn` without pulling the server stack in with it.
 */
import { webAppUrl } from "./appBasePath";

/** The in-app pages a connect flow may return to. */
export const CONNECT_RETURN_TARGETS = ["settings", "inbox"] as const;

export type ConnectReturnTarget = (typeof CONNECT_RETURN_TARGETS)[number];

/**
 * Settings is the safe default: it hosts the accounts list, so it makes sense
 * whether or not the connect actually produced an account.
 */
export const DEFAULT_CONNECT_RETURN_TARGET: ConnectReturnTarget = "settings";

/** Narrow an untrusted value to a known target, defaulting when it isn't one. */
export function parseConnectReturnTarget(value: unknown): ConnectReturnTarget {
  return CONNECT_RETURN_TARGETS.includes(value as ConnectReturnTarget)
    ? (value as ConnectReturnTarget)
    : DEFAULT_CONNECT_RETURN_TARGET;
}

/**
 * The app-relative path for a target. "inbox" prefers the account just
 * connected; without one it points at the app root, which picks a default
 * account itself (and shows the onboarding gate when there is none).
 */
export function connectReturnPath(target: ConnectReturnTarget, accountId?: string | null): string {
  if (target === "inbox") {
    return accountId ? `/account/${encodeURIComponent(accountId)}` : "/";
  }
  return "/settings";
}

export interface ConnectOutcome {
  target: ConnectReturnTarget;
  /** The account the flow produced, when it produced one. */
  accountId?: string | null;
  /** Email of the connected account — surfaced as a success toast. */
  connected?: string;
  /** Failure reason — surfaced as an error toast. */
  error?: string;
}

/**
 * Absolute URL the callback redirects to: the target's page under the app's
 * base path, plus the one query param the SPA reads to confirm the outcome.
 */
export function connectReturnUrl(origin: string, outcome: ConnectOutcome): string {
  const url = webAppUrl(origin, connectReturnPath(outcome.target, outcome.accountId));
  const query = new URLSearchParams();
  if (outcome.connected) query.set("connected", outcome.connected);
  else if (outcome.error) query.set("connect_error", outcome.error);
  const search = query.toString();
  return search ? `${url}?${search}` : url;
}
