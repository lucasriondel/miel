import type { Account } from "../../api/types";

/**
 * What a mailbox is called on screen: the Google display name, or the
 * address's local part when Google gave none. miel stores no nickname of its
 * own, so the design's "Lucas — Pro" is this name and nothing more.
 */
export const accountDisplayName = (account: Pick<Account, "displayName" | "email">): string =>
  account.displayName?.trim() || account.email.split("@")[0] || account.email;
