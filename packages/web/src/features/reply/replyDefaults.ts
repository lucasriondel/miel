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

const sender = (message: Pick<MessageDetail, "fromEmail" | "fromName">): string =>
  message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail;

const forwardDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * The body a forward opens with: a blank line to write above, then the
 * forwarded message as plain text — the header block every client writes, and
 * the original's text part.
 *
 * Text only, by decision: the send path carries a single `text/plain` part, so
 * the original's attachments and its HTML do not travel with it, and the body
 * says so rather than letting the recipient discover it.
 */
export const forwardBody = (
  message: Pick<
    MessageDetail,
    | "fromEmail"
    | "fromName"
    | "internalDate"
    | "subject"
    | "toEmails"
    | "bodyText"
    | "snippet"
    | "attachments"
  >,
): string => {
  const lines = [
    "",
    "",
    "---------- Forwarded message ---------",
    `From: ${sender(message)}`,
    `Date: ${forwardDate(message.internalDate)}`,
    `Subject: ${message.subject?.trim() || "(no subject)"}`,
    `To: ${message.toEmails.join(", ")}`,
    "",
    (message.bodyText ?? message.snippet ?? "").trim(),
  ];
  if (message.attachments.length > 0) {
    lines.push("", `(${message.attachments.length} attachment(s) not included)`);
  }
  return lines.join("\n");
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
