import { toast } from "sonner";
import { ApiError, apiFetch } from "../../api/client";

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

async function startReauth(account: string): Promise<string> {
  const res = await apiFetch<{ url: string }>({
    path: "/auth/reauth",
    method: "POST",
    body: { account },
  });
  return res.url;
}

/**
 * Returns true if the error was a reauth_required error and a toast was shown.
 * Callers should bail out of their normal error UI in that case.
 */
export function maybeShowReauthToast(err: unknown): boolean {
  const reauth = parseReauthError(err);
  if (!reauth) return false;

  toast.error(`Re-authenticate ${reauth.account}`, {
    id: `reauth:${reauth.account}`,
    description:
      "Google rejected the stored credentials for this account. Click below to start the OAuth flow.",
    duration: Infinity,
    action: {
      label: "Re-authenticate",
      onClick: async () => {
        const pending = toast.loading(`Starting OAuth for ${reauth.account}…`, {
          id: `reauth-start:${reauth.account}`,
        });
        try {
          const url = await startReauth(reauth.account);
          toast.dismiss(pending);
          toast.dismiss(`reauth:${reauth.account}`);
          window.open(url, "_blank", "noopener,noreferrer");
          toast.success(
            `Opened Google sign-in for ${reauth.account}. Try syncing again once you've finished.`,
          );
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
  return true;
}
