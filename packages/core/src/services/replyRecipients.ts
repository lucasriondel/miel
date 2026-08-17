/**
 * Who a reply goes to (#96).
 *
 * The compose window edits To and Cc, so the address lists arrive from the
 * client — but a reply sent from the CLI, or from a client that names neither,
 * still has to reach the person being answered. That is two rules and no I/O:
 * clean what was typed, and fall back to the message's own sender when nothing
 * usable was typed. Kept beside the service rather than inside its Effect so
 * both can be read — and tested — without a database.
 */

/** The stored message a reply is being written to. */
export interface ReplySource {
  fromEmail: string;
  toEmails: string[];
}

/** What the sender typed into the compose window, if anything. */
export interface RecipientOverride {
  to?: string[];
  cc?: string[];
}

export interface ResolvedRecipients {
  to: string[];
  /** Absent rather than empty: an empty Cc header is not the same as none. */
  cc?: string[];
}

/** Trimmed, blank-free, first spelling of each address (addresses are case-insensitive). */
const cleanAddressList = (list: readonly string[] | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const address = raw.trim();
    if (address.length === 0) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
};

/**
 * The address a reply falls back to: the sender of the message being answered,
 * unless they are already among its recipients — a note to self or a reflecting
 * list has no separate sender to answer, so its To line stands.
 */
export const defaultReplyTo = (msg: ReplySource): string[] => {
  const recipients = msg.toEmails.length > 0 ? msg.toEmails : [msg.fromEmail];
  return msg.fromEmail && !recipients.includes(msg.fromEmail) ? [msg.fromEmail] : recipients;
};

export const resolveReplyRecipients = (
  msg: ReplySource,
  override: RecipientOverride,
): ResolvedRecipients => {
  const to = cleanAddressList(override.to);
  const cc = cleanAddressList(override.cc);
  return {
    to: to.length > 0 ? to : defaultReplyTo(msg),
    ...(cc.length > 0 ? { cc } : {}),
  };
};
