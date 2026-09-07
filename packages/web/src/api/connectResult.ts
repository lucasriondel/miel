/**
 * The outcome the OAuth callback hands back to the SPA.
 *
 * The callback can land on any of the pages a connect flow may start from (see
 * `@miel/core/connectReturn`), so reading it is deliberately page-agnostic:
 * pure functions over the query string, driven by `useConnectResult` on the app
 * layout rather than by whichever page happens to be underneath.
 */

export type ConnectResult =
  | { kind: "connected"; email: string }
  | { kind: "error"; reason: string };

const CONNECT_PARAMS = ["connected", "connect_error"] as const;

/** The connect outcome carried by a landing URL, or null if there is none. */
export function readConnectResult(params: URLSearchParams): ConnectResult | null {
  const connected = params.get("connected");
  if (connected) return { kind: "connected", email: connected };
  const reason = params.get("connect_error");
  if (reason) return { kind: "error", reason };
  return null;
}

/** A copy of `params` without the connect outcome — so a refresh can't re-toast. */
export function stripConnectResult(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const param of CONNECT_PARAMS) next.delete(param);
  return next;
}
