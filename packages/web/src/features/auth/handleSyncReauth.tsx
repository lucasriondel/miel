import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "../../api/client";
import type { StartReauthResult } from "../../api/types";
import { queryKeys } from "../../api/queries";
import { PasteBackToast } from "./PasteBackToast";

interface ReauthEvent {
  account: string;
  sessionId?: string;
  url?: string;
}

const reauthToastId = (account: string) => `reauth:${account}`;

/**
 * Renders the persistent paste-back toast for a reauth session. The user opens
 * the Google sign-in, then pastes the full redirect URL back; on success we
 * invalidate accounts/messages and prompt a manual re-sync (PRD decision 12).
 */
function showPasteBackToast(
  account: string,
  sessionId: string,
  url: string,
  qc: QueryClient,
): void {
  // Open the sign-in in a new tab proactively; the toast also links to it.
  window.open(url, "_blank", "noopener,noreferrer");
  toast.custom(
    (id) => (
      <PasteBackToast
        toastId={id}
        sessionId={sessionId}
        url={url}
        title={`Re-authenticate ${account}`}
        description="Open Google sign-in, then paste the redirect URL here."
        placeholder="Paste redirect URL"
        submitPath="/auth/reauth/code"
        onSuccess={() => {
          toast.success(
            `Re-authenticated ${account}. Sync again to fetch its mail.`,
          );
          qc.invalidateQueries({ queryKey: queryKeys.accounts });
          qc.invalidateQueries({ queryKey: ["messages"] });
        }}
      />
    ),
    { id: reauthToastId(account), duration: Infinity },
  );
}

/**
 * Signal-only fallback (no sessionId/url): the server couldn't eagerly spawn
 * the reauth session, so show a click-to-start button that hits POST
 * /auth/reauth, then renders the paste-back toast from its {sessionId,url}.
 */
function showStartButtonToast(account: string, qc: QueryClient): void {
  toast.error(`Re-authenticate ${account}`, {
    id: reauthToastId(account),
    description:
      "Google rejected the stored credentials for this account. Click below to start the OAuth flow.",
    duration: Infinity,
    action: {
      label: "Re-authenticate",
      onClick: async () => {
        const pending = toast.loading(`Starting OAuth for ${account}…`, {
          id: `reauth-start:${account}`,
        });
        try {
          const res = await apiFetch<StartReauthResult>({
            path: "/auth/reauth",
            method: "POST",
            body: { account },
          });
          toast.dismiss(pending);
          toast.dismiss(reauthToastId(account));
          showPasteBackToast(account, res.sessionId, res.url, qc);
        } catch (e) {
          toast.dismiss(pending);
          toast.error(
            `Could not start re-auth: ${
              e instanceof Error ? e.message : "unknown error"
            }`,
          );
        }
      },
    },
  });
}

/**
 * Entry point for the `sync.reauth_required` WS event. Eager path (server
 * already spawned the session) shows the paste-back toast directly; signal-only
 * path shows a click-to-start button.
 */
export function handleSyncReauth(event: ReauthEvent, qc: QueryClient): void {
  if (event.sessionId && event.url) {
    showPasteBackToast(event.account, event.sessionId, event.url, qc);
    return;
  }
  showStartButtonToast(event.account, qc);
}
