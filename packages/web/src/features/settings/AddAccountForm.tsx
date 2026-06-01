import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "../../api/client";
import { queryKeys } from "../../api/queries";
import { useSyncAccounts } from "../../api/mutations";
import type { StartReauthResult } from "../../api/types";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { PasteBackToast } from "../auth/PasteBackToast";

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

const addToastId = (email: string) => `add-account:${email}`;

/**
 * Renders the paste-back toast for an add-account session — mirrors the reauth
 * toast (open Google sign-in, paste the redirect URL back) but reuses the same
 * submit endpoint. `onImported` runs after the URL is accepted: the account is
 * now authorized in gog but not yet in the DB, so the caller syncs it in.
 */
function showAddAccountToast(
  email: string,
  sessionId: string,
  url: string,
  onImported: () => void,
): void {
  window.open(url, "_blank", "noopener,noreferrer");
  toast.custom(
    (id) => (
      <PasteBackToast
        toastId={id}
        sessionId={sessionId}
        url={url}
        title={`Add ${email}`}
        description="Open Google sign-in, then paste the redirect URL here."
        placeholder="Paste redirect URL"
        submitPath="/auth/reauth/code"
        onSuccess={onImported}
      />
    ),
    { id: addToastId(email), duration: Infinity },
  );
}

/**
 * Settings form to authorize a brand-new Gmail account from the UI. Wraps
 * `gog auth add <email> --services gmail --manual` via POST /auth/add-account,
 * then drives the shared paste-back flow.
 */
export const AddAccountForm = () => {
  const qc = useQueryClient();
  const syncAccounts = useSyncAccounts();
  const [email, setEmail] = useState("");
  const [starting, setStarting] = useState(false);

  const start = async () => {
    const account = email.trim();
    if (!account || starting) return;
    setStarting(true);
    try {
      const res = await apiFetch<StartReauthResult>({
        path: "/auth/add-account",
        method: "POST",
        body: { account },
      });
      showAddAccountToast(account, res.sessionId, res.url, async () => {
        // gog-authorized ≠ in DB: import the new account, then refresh the list.
        try {
          await syncAccounts.mutateAsync();
          qc.invalidateQueries({ queryKey: queryKeys.accounts });
          toast.success(`Added ${account}`);
          setEmail("");
        } catch (e) {
          toast.error(`Authorized ${account}, but importing it failed: ${describeError(e)}`);
        }
      });
    } catch (e) {
      toast.error(`Could not start add account: ${describeError(e)}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-miel-line bg-miel-bg p-3">
      <label className="text-xs font-medium text-miel-muted" htmlFor="add-account-email">
        Add a Gmail account
      </label>
      <div className="flex items-center gap-2">
        <input
          id="add-account-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") start();
          }}
          placeholder="you@gmail.com"
          autoComplete="off"
          className="flex-1 rounded border border-miel-line bg-miel-panel px-2 py-1 text-sm text-miel-ink placeholder:text-miel-muted"
        />
        <Button variant="primary" onClick={start} disabled={!email.trim() || starting}>
          {starting ? <Spinner size={12} /> : null}
          {starting ? "Starting…" : "Add account"}
        </Button>
      </div>
      <p className="text-xs text-miel-muted">
        Opens Google sign-in; paste the redirect URL back to finish.
      </p>
    </div>
  );
};
