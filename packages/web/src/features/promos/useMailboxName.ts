import { useAccounts } from "../../api/queries";
import { accountDisplayName } from "../../components/sidebar/accountDisplayName";

/**
 * What a promo's mailbox is called on screen: its name in miel — the nickname,
 * else the Google name — when the address is one of the connected accounts,
 * else the address itself, which is also the answer while the accounts load.
 */
export function useMailboxName(email: string): string {
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.email.toLowerCase() === email.toLowerCase());
  return account ? accountDisplayName(account) : email;
}
