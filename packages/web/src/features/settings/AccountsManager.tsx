import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useAccounts } from "../../api/queries";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { AccountRow } from "./AccountRow";
import { ConnectGoogleButton } from "./ConnectGoogleButton";
import { SettingsPanel } from "./SettingsPanel";

/**
 * The Mailboxes tab's one card: the connected Gmail accounts, with the connect
 * action on the card's heading. Each row can be removed behind an inline
 * confirm; the armed row is tracked here so only one account confirms at a time.
 */
export const AccountsManager = () => {
  const accounts = useAccounts();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <SettingsPanel
      title="Connected"
      action={<ConnectGoogleButton label="Connect a Gmail account" className="h-8 px-3.5" />}
    >
      {accounts.isLoading ? (
        <div className="flex items-center gap-2 px-4 py-4 text-[13px] text-gousse-muted">
          <Spinner /> Loading accounts…
        </div>
      ) : accounts.error ? (
        <div role="alert" className="px-4 py-4 text-[13px] text-gousse-error">
          Failed to load accounts: {apiErrorMessage(accounts.error)}
        </div>
      ) : !accounts.data || accounts.data.length === 0 ? (
        <div className="px-4 py-5">
          <p className="text-[13px] font-medium text-gousse-ink">No accounts yet</p>
          <p className="mt-0.5 text-xs text-gousse-muted">
            Connect a Gmail account to start syncing it.
          </p>
        </div>
      ) : (
        accounts.data.map((acc) => (
          <AccountRow
            key={acc.id}
            account={acc}
            confirming={confirmingId === acc.id}
            onRequestConfirm={() => setConfirmingId(acc.id)}
            onCancelConfirm={() => setConfirmingId(null)}
          />
        ))
      )}
    </SettingsPanel>
  );
};
