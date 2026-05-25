import { toast } from "sonner";
import { apiFetch } from "../../api/client";
import type { StartClaudeLoginResult } from "../../api/types";
import { ClaudeLoginToast } from "./ClaudeLoginToast";

/**
 * Imperative entry point: starts a Claude CLI login session, opens the OAuth URL
 * in a new tab, and shows a persistent toast with an input for the pasted code.
 * Mirrors the gog reauth flow in reauthToast.tsx but adds the code paste-back.
 */
export async function startClaudeLoginFlow(onSuccess?: () => void): Promise<void> {
  const pending = toast.loading("Starting Claude sign-in…", {
    id: "claude-login-start",
  });
  try {
    const res = await apiFetch<StartClaudeLoginResult>({
      path: "/auth/claude/login",
      method: "POST",
    });
    toast.dismiss(pending);
    window.open(res.url, "_blank", "noopener,noreferrer");
    toast.custom(
      (id) => (
        <ClaudeLoginToast
          toastId={id}
          sessionId={res.sessionId}
          url={res.url}
          onSuccess={onSuccess}
        />
      ),
      { id: "claude-login", duration: Infinity },
    );
  } catch (e) {
    toast.dismiss(pending);
    toast.error(
      `Could not start Claude sign-in: ${
        e instanceof Error ? e.message : "unknown error"
      }`,
    );
  }
}
