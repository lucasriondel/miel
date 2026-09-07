import { format, formatDistanceToNow } from "date-fns";
import { useRemoveAccount } from "../../api/mutations";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { Avatar } from "../../components/ui/avatar";
import { SettingRow } from "@/components/ui/setting-row";
import { AccountRowActions } from "./AccountRowActions";
import type { Account } from "../../api/types";

interface Props {
  account: Account;
  /** Armed for removal — the list owns this so only one row confirms at a time. */
  confirming: boolean;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
}

function syncedLabel(acc: Account): string {
  if (!acc.lastSyncedAt) return "Never synced";
  const d = new Date(acc.lastSyncedAt);
  return `Synced ${formatDistanceToNow(d, { addSuffix: true })} · ${format(d, "PPp")}`;
}

/** One connected account, with its inline remove confirm and failure message. */
export const AccountRow = ({ account, confirming, onRequestConfirm, onCancelConfirm }: Props) => {
  const remove = useRemoveAccount();

  return (
    <SettingRow
      leading={<Avatar email={account.email} avatarUrl={account.avatarUrl} />}
      title={account.email}
      description={
        <>
          <span className="tabular-nums">
            {account.displayName ? `${account.displayName} · ` : ""}
            {syncedLabel(account)}
          </span>
          {remove.error ? (
            <span className="mt-0.5 block text-gousse-high">
              Failed to remove: {apiErrorMessage(remove.error)}
            </span>
          ) : null}
        </>
      }
      control={
        <AccountRowActions
          confirming={confirming}
          pending={remove.isPending}
          onRequestConfirm={onRequestConfirm}
          onCancel={onCancelConfirm}
          // The row disappears on success, so there's nothing to un-arm; a
          // failure keeps the confirm open with the message above.
          onConfirm={() => {
            remove.mutate({ accountId: account.id }, { onSuccess: onCancelConfirm });
          }}
        />
      }
    />
  );
};
