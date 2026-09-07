import { useState } from "react";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useAccounts } from "../../api/queries";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { SettingRow, SettingsCard } from "@/components/ui/setting-row";
import { AccountRow } from "./AccountRow";
import { ConnectGoogleButton } from "./ConnectGoogleButton";

/**
 * Connected Gmail accounts as rows in one card, with a Connect action row at the
 * bottom. Each row can be removed behind an inline confirm; the armed row is
 * tracked here so only one account confirms at a time.
 */
export const AccountsManager = () => {
  const accounts = useAccounts();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <SettingsCard>
      {accounts.isLoading ? (
        <div className="flex items-center gap-2 px-4 py-3.5 text-sm text-gousse-muted">
          <Spinner /> Loading accounts…
        </div>
      ) : accounts.error ? (
        <div className="px-4 py-3.5 text-sm text-gousse-high">
          Failed to load accounts: {apiErrorMessage(accounts.error)}
        </div>
      ) : !accounts.data || accounts.data.length === 0 ? (
        <div className="px-4 py-4">
          <Empty
            title="No accounts yet"
            description="Connect a Gmail account below to start syncing it."
          />
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
      <SettingRow
        title="Add a mailbox"
        description="Connect another Gmail account with Google to start syncing it."
        control={<ConnectGoogleButton />}
      />
    </SettingsCard>
  );
};
