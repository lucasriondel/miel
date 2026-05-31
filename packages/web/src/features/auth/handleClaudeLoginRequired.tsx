import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "../../api/queries";
import { ClaudeLoginToast } from "./ClaudeLoginToast";
import { startClaudeLoginFlow } from "./startClaudeLoginFlow";

interface ClaudeLoginEvent {
  sessionId?: string;
  url?: string;
}

// Single global toast id: the Claude login is not per-account, so repeated
// `sync.claude_login_required` events collapse onto one toast.
const CLAUDE_LOGIN_TOAST_ID = "claude-login";

/**
 * Renders the persistent paste-back toast for a Claude login session. After the
 * user pastes the code and login succeeds, `onSuccess` runs (auto-retriage).
 */
function showPasteBackToast(
  sessionId: string,
  url: string,
  onSuccess: () => void,
): void {
  window.open(url, "_blank", "noopener,noreferrer");
  toast.custom(
    (id) => (
      <ClaudeLoginToast
        toastId={id}
        sessionId={sessionId}
        url={url}
        onSuccess={onSuccess}
      />
    ),
    { id: CLAUDE_LOGIN_TOAST_ID, duration: Infinity },
  );
}

interface HandleClaudeLoginOptions {
  /** Toast ids ("sync:triage:<account>") to dismiss; their runs bailed for login. */
  dismissToastIds?: string[];
  /** Runs after login succeeds — used to auto-retriage the affected accounts. */
  onLoggedIn?: () => void;
}

/**
 * Entry point for the `sync.claude_login_required` WS event. Eager path (server
 * already spawned the login session) shows the paste-back toast directly;
 * signal-only path reuses startClaudeLoginFlow's click-to-start flow. On success
 * we invalidate the Claude auth status and run `onLoggedIn` (auto-retriage).
 */
export function handleClaudeLoginRequired(
  event: ClaudeLoginEvent,
  qc: QueryClient,
  opts: HandleClaudeLoginOptions = {},
): void {
  // syncAll/triageUntriaged stop emitting triage.finished when they bail out for
  // login, so the in-flight "Claude is triaging…" toasts would otherwise hang.
  for (const id of opts.dismissToastIds ?? []) toast.dismiss(id);

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: queryKeys.claudeAuth });
    opts.onLoggedIn?.();
  };

  if (event.sessionId && event.url) {
    showPasteBackToast(event.sessionId, event.url, onSuccess);
    return;
  }
  // Signal-only: no eager session, so drive the click-to-start flow. It opens a
  // fresh login session and renders the same paste-back toast on click.
  void startClaudeLoginFlow(onSuccess);
}
