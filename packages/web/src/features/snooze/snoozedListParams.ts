import type { ListMessagesParams } from "../../api/queries";

/**
 * The one spelling of the Snoozed view's read: the account's snoozed threads,
 * no period, no label. The sidebar's "Snoozed N" and the view itself both ask
 * with it, so they are one cache entry and one request.
 */
export const snoozedListParams = (accountId: string | undefined): ListMessagesParams => ({
  accountId,
  snoozedOnly: true,
});
