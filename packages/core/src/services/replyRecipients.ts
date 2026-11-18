/**
 * Who a reply goes to (#96).
 *
 * The compose window edits To and Cc, so the address lists arrive from the
 * client — but a reply sent from the CLI, or from a client that names neither,
 * still has to reach the person being answered. That is two rules and no I/O:
 * clean what was typed, and fall back to the message's own sender when nothing
 * usable was typed. Kept beside the service rather than inside its Effect so
 * both can be read — and tested — without a database.
 *
 * Reply-all and Bcc ride on the same two rules: what was typed wins, and with
 * nothing typed reply-all copies the original's other participants
 * ({@link replyAllCc}) while Bcc stays empty.
 */
import { parseAddressList } from "../util/gmailPayload";

/** The stored message a reply is being written to. */
export interface ReplySource {
  fromEmail: string;
  toEmails: string[];
  /**
   * The original's Cc, parsed off its stored headers ({@link ccFromHeaders}).
   * Only reply-all reads it; there is no column for it, so no migration.
   */
  ccEmails?: string[];
}

/** What the sender typed into the compose window, if anything. */
export interface RecipientOverride {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  /**
   * Reply to everyone: with no Cc typed, the Cc defaults to the original's
   * other participants ({@link replyAllCc}) rather than to nobody.
   */
  replyAll?: boolean;
}

export interface ResolvedRecipients {
  to: string[];
  /** Absent rather than empty: an empty Cc header is not the same as none. */
  cc?: string[];
  /** Absent rather than empty, for the same reason. */
  bcc?: string[];
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

/**
 * The Cc addresses of a stored message, read off its raw headers.
 *
 * Header names are matched case-insensitively — sync lowercases them, but a row
 * written by an older path may not have — and an absent header is no Cc.
 */
export const ccFromHeaders = (rawHeaders: Record<string, string> | null | undefined): string[] => {
  if (!rawHeaders) return [];
  const key = Object.keys(rawHeaders).find((k) => k.toLowerCase() === "cc");
  return key ? parseAddressList(rawHeaders[key]) : [];
};

/**
 * Who reply-all copies: everyone the original was addressed or copied to, minus
 * the account replying (nobody copies themselves) and minus whoever the reply's
 * To line already names. The sender is answered in To ({@link defaultReplyTo}),
 * the other participants land in Cc — which is what "Reply all adds the other
 * participants to Cc" means, and what Gmail does.
 */
export const replyAllCc = (
  msg: ReplySource,
  ownAddress: string,
  replyTo: readonly string[] = defaultReplyTo(msg),
): string[] => {
  const excluded = new Set([ownAddress, ...replyTo].map((a) => a.trim().toLowerCase()));
  return cleanAddressList([...msg.toEmails, ...(msg.ccEmails ?? [])]).filter(
    (address) => !excluded.has(address.toLowerCase()),
  );
};

export const resolveReplyRecipients = (
  msg: ReplySource,
  override: RecipientOverride,
  /** The replying account's address; reply-all leaves it out of the Cc. */
  ownAddress = "",
): ResolvedRecipients => {
  const typedTo = cleanAddressList(override.to);
  const to = typedTo.length > 0 ? typedTo : defaultReplyTo(msg);
  const typedCc = cleanAddressList(override.cc);
  const cc =
    typedCc.length > 0 ? typedCc : override.replyAll ? replyAllCc(msg, ownAddress, to) : [];
  const bcc = cleanAddressList(override.bcc);
  return {
    to,
    ...(cc.length > 0 ? { cc } : {}),
    ...(bcc.length > 0 ? { bcc } : {}),
  };
};
