import type { Account } from "../../api/types";

/**
 * What a mailbox is called on screen: the nickname given to it in miel
 * (Settings › Mailboxes, `PATCH /accounts/:id`), else the Google display name,
 * else the address's local part. Gmail is never told the nickname — it is this
 * install's name for the mailbox, the design's "Lucas — Pro".
 */
export const accountDisplayName = (
  account: Pick<Account, "displayName" | "email"> & { nickname?: string | null },
): string =>
  account.nickname?.trim() ||
  account.displayName?.trim() ||
  account.email.split("@")[0] ||
  account.email;
