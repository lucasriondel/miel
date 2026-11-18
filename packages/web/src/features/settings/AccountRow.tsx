import { useRemoveAccount } from "../../api/mutations";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { Avatar } from "../../components/ui/avatar";
import { AccountRowActions } from "./AccountRowActions";
import { AccountSyncMeta } from "./AccountSyncMeta";
import { SettingsRow } from "./SettingsRow";
import type { Account } from "../../api/types";

interface Props {
  account: Account;
  /** Armed for removal — the list owns this so only one row confirms at a time. */
  confirming: boolean;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
}

/**
 * One connected account: its avatar, address and Google name, when it last
 * synced, and its inline remove confirm with any failure message.
 */
export const AccountRow = ({ account, confirming, onRequestConfirm, onCancelConfirm }: Props) => {
  const remove = useRemoveAccount();

  return (
    <SettingsRow
      className="py-3.5"
      leading={
        <Avatar
          email={account.email}
          avatarUrl={account.avatarUrl}
          chars={1}
          className="h-9 w-9 text-[13px]"
        />
      }
      title={account.email}
      description={
        <>
          {account.displayName ? <span>{account.displayName}</span> : null}
          {remove.error ? (
            <span role="alert" className="mt-0.5 block text-gousse-error">
              Failed to remove: {apiErrorMessage(remove.error)}
            </span>
          ) : null}
        </>
      }
      control={
        <>
          {confirming ? null : <AccountSyncMeta lastSyncedAt={account.lastSyncedAt} />}
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
        </>
      }
    />
  );
};
