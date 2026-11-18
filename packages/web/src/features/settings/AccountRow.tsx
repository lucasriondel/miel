import { useState } from "react";
import { useRemoveAccount } from "../../api/mutations";
import { useRenameAccount } from "../../api/accountNickname.hooks";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { Avatar } from "../../components/ui/avatar";
import { AccountNameEditor } from "./AccountNameEditor";
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
 * One connected account: its avatar, its name in miel — the nickname when it
 * has one, with the address under it, else the address with the Google name
 * under it — when it last synced, an inline rename, and the inline remove
 * confirm with any failure message.
 */
export const AccountRow = ({ account, confirming, onRequestConfirm, onCancelConfirm }: Props) => {
  const remove = useRemoveAccount();
  const rename = useRenameAccount();
  const [renaming, setRenaming] = useState(false);
  const nickname = account.nickname?.trim() || null;

  const title = renaming ? (
    <AccountNameEditor
      initial={nickname ?? ""}
      fallback={account.displayName ?? account.email}
      pending={rename.isPending}
      onCancel={() => setRenaming(false)}
      onSave={(next) =>
        rename.mutate(
          { accountId: account.id, nickname: next },
          { onSuccess: () => setRenaming(false) },
        )
      }
    />
  ) : (
    (nickname ?? account.email)
  );
  const secondLine = nickname ? account.email : account.displayName;

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
      title={title}
      description={
        <>
          {secondLine ? <span>{secondLine}</span> : null}
          {rename.error ? (
            <span role="alert" className="mt-0.5 block text-gousse-error">
              Failed to rename: {apiErrorMessage(rename.error)}
            </span>
          ) : null}
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
            renaming={renaming}
            onRename={() => {
              rename.reset();
              setRenaming(true);
            }}
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
