import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { handleClaudeLoginRequired } from "./handleClaudeLoginRequired";

function isClaudeNotLoggedInError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  const body = err.body;
  if (!body || typeof body !== "object") return false;
  return (body as Record<string, unknown>).error === "claude_not_logged_in";
}

/**
 * Detects a `409 claude_not_logged_in` body from a REST mutation (e.g. reply
 * generation) and shows the click-to-start Claude login toast (signal-only: the
 * REST error carries no eager session). `onLoggedIn` runs after login succeeds —
 * pass the action to retry (e.g. re-generate the reply).
 *
 * Returns true if the error was claude_not_logged_in and a toast was shown.
 * Callers should bail out of their normal error UI in that case.
 */
export function maybeShowClaudeLoginToast(
  err: unknown,
  qc: QueryClient,
  onLoggedIn?: () => void,
): boolean {
  if (!isClaudeNotLoggedInError(err)) return false;
  handleClaudeLoginRequired({}, qc, { onLoggedIn });
  return true;
}
