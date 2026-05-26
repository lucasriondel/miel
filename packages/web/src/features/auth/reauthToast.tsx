import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { handleSyncReauth } from "./handleSyncReauth";

interface ReauthErrorBody {
  error: "reauth_required";
  account: string;
  message?: string;
}

function parseReauthError(err: unknown): ReauthErrorBody | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body;
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.error !== "reauth_required") return null;
  if (typeof b.account !== "string") return null;
  return {
    error: "reauth_required",
    account: b.account,
    message: typeof b.message === "string" ? b.message : undefined,
  };
}

/**
 * Detects a `409 reauth_required` body from a REST mutation (label/reply/etc.)
 * and shows the click-to-start reauth toast. Since `/auth/reauth` is now a
 * manual paste-back flow, the button renders a PasteBackToast from its
 * {sessionId,url} response (delegated to handleSyncReauth's signal-only path).
 *
 * Returns true if the error was a reauth_required error and a toast was shown.
 * Callers should bail out of their normal error UI in that case.
 */
export function maybeShowReauthToast(
  err: unknown,
  qc: QueryClient,
): boolean {
  const reauth = parseReauthError(err);
  if (!reauth) return false;
  // Signal-only: no eager session from a REST error, so this drives the
  // click-to-start button path that POSTs /auth/reauth then pastes back.
  handleSyncReauth({ account: reauth.account }, qc);
  return true;
}
