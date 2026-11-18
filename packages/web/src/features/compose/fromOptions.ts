import type { SendAsAlias } from "../../api/composeReads.hooks";
import type { Account } from "../../api/types";
import { accountDisplayName } from "../../components/sidebar/accountDisplayName";
import type { ComposeKind } from "./composeSession";

/** One way the From menu offers to send: a connected mailbox, or one of its aliases. */
export interface FromOption {
  key: string;
  accountId: string;
  /** The send-as address, or null for the mailbox's own. */
  alias: string | null;
  name: string;
  email: string;
  /** "received here" on the mailbox a reply's message arrived in. */
  note: string | null;
}

interface Input {
  kind: ComposeKind;
  /** The mailbox the window belongs to: the one on screen, or the one answered from. */
  windowAccountId: string;
  accounts: readonly Account[];
  /** That mailbox's send-as list, once known. */
  aliases: readonly SendAsAlias[];
}

/**
 * What the From row can send as. The window's own mailbox first, then its
 * verified aliases (Gmail rewrites any other From, so an unverified one is not
 * offered), then the other connected mailboxes — except on a forward, which
 * the server builds from the original in the mailbox it arrived in. A reply
 * marks that mailbox "received here", which is also the default.
 *
 * One option is no choice: the row is then plain text, as the design draws a
 * single mailbox.
 */
export const fromOptions = ({ kind, windowAccountId, accounts, aliases }: Input): FromOption[] => {
  const own = accounts.find((a) => a.id === windowAccountId);
  if (!own) return [];
  const ownName = accountDisplayName(own);
  const note =
    kind === "reply" || kind === "replyAll" || kind === "forward" ? "received here" : null;
  const options: FromOption[] = [
    { key: `${own.id}:`, accountId: own.id, alias: null, name: ownName, email: own.email, note },
  ];
  for (const alias of aliases) {
    if (!alias.verified || alias.email.toLowerCase() === own.email.toLowerCase()) continue;
    options.push({
      key: `${own.id}:${alias.email}`,
      accountId: own.id,
      alias: alias.email,
      name: alias.displayName?.trim() || ownName,
      email: alias.email,
      note: null,
    });
  }
  if (kind !== "forward") {
    for (const other of accounts) {
      if (other.id === own.id) continue;
      options.push({
        key: `${other.id}:`,
        accountId: other.id,
        alias: null,
        name: accountDisplayName(other),
        email: other.email,
        note: null,
      });
    }
  }
  return options;
};

/** The option a window's fields point at, or the mailbox itself when nothing else matches. */
export const selectedFrom = (
  options: readonly FromOption[],
  fromAccountId: string,
  fromAlias: string | null,
): FromOption | undefined =>
  options.find((o) => o.accountId === fromAccountId && o.alias === fromAlias) ??
  options.find((o) => o.accountId === fromAccountId && o.alias === null);
