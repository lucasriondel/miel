import { formatAddressList } from "../compose/recipients";
import type { MessageDetail } from "../../api/types";

/**
 * What the compose window is prefilled with when it opens on a reply (#96).
 *
 * Pure and reply-specific: the window itself knows nothing about a message
 * being answered, which is what lets a future blank Compose mount the same
 * component with empty fields instead of these.
 *
 * The To line mirrors what the server would have addressed the reply to on its
 * own (`replyRecipients.ts` in core) — the sender of the message — so opening
 * the window and sending without touching it sends what it always sent.
 */
export const replyToLine = (message: Pick<MessageDetail, "fromEmail">): string =>
  formatAddressList(message.fromEmail ? [message.fromEmail] : []);

/**
 * `Re:` once, never twice: a reply to a reply keeps the subject it was given,
 * which is also what Gmail and every other client do with an existing prefix.
 */
export const replySubject = (subject: string | null): string => {
  const trimmed = subject?.trim() ?? "";
  if (trimmed.length === 0) return "Re:";
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
};

/** The title bar's line: the subject being answered, or the empty-subject copy. */
export const replyWindowTitle = (subject: string | null): string =>
  subject?.trim() || "(no subject)";

/** `Fwd:` once, never twice, the way {@link replySubject} treats `Re:`. */
export const forwardSubject = (subject: string | null): string => {
  const trimmed = subject?.trim() ?? "";
  if (trimmed.length === 0) return "Fwd:";
  return /^(fwd?|tr):/i.test(trimmed) ? trimmed : `Fwd: ${trimmed}`;
};

/**
 * The names the chips can show for a reply's prefilled addresses: the sender's
 * display name is the one the stored message knows.
 */
export const knownNames = (
  message: Pick<MessageDetail, "fromEmail" | "fromName">,
): Record<string, string> =>
  message.fromName && message.fromEmail
    ? { [message.fromEmail.toLowerCase()]: message.fromName }
    : {};
