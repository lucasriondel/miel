import { AccountsManager } from "./AccountsManager";
import { GoogleClientCard } from "./GoogleClientCard";

/**
 * Mailboxes: the connected Gmail accounts and the way to add one, then the
 * Google OAuth client they all sign in through.
 */
export const MailboxesTab = () => (
  <>
    <AccountsManager />
    <GoogleClientCard />
  </>
);
