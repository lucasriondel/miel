import type { ListedMessage } from "../../api/types";
import { detectConfirmationCodes, type ConfirmationCode } from "../../utils/detectConfirmation";

export interface VerificationEntry {
  accountId: string;
  gmailMessageId: string;
  /** Display name for the pill — sender name, falling back to the address. */
  sender: string;
  code: ConfirmationCode;
  internalDate: string;
}

/** Codes older than this are stale enough that showing them is noise. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Cap so the strip never grows unbounded on a big inbox. */
const MAX_ENTRIES = 6;

/**
 * Flatten the message list into the pills the strip renders.
 *
 * Only the first code per message is taken: a mail typically carries one real
 * code plus incidental numbers, and showing three pills from one sender reads
 * as noise. Detection runs over subject + snippet only — that is all the list
 * payload carries, and it is where senders put the code.
 */
export function collectVerificationCodes(
  messages: ListedMessage[],
  now: number = Date.now(),
): VerificationEntry[] {
  const entries: VerificationEntry[] = [];

  for (const message of messages) {
    if (message.isTrashed || message.isArchived) continue;

    const at = new Date(message.internalDate).getTime();
    if (Number.isNaN(at) || now - at > MAX_AGE_MS) continue;

    const detection = detectConfirmationCodes(message.subject, message.snippet, null);
    const code = detection.codes[0];
    if (!code) continue;

    entries.push({
      accountId: message.accountId,
      gmailMessageId: message.gmailMessageId,
      sender: message.fromName?.trim() || message.fromEmail,
      code,
      internalDate: message.internalDate,
    });
  }

  const newestFirst = entries.toSorted(
    (a, b) => new Date(b.internalDate).getTime() - new Date(a.internalDate).getTime(),
  );

  // Two messages can carry the same code — a resent code, or the same sender
  // retrying. Keep only the newest pill per value, so the strip never shows
  // the same digits twice.
  const byValue = new Map<string, VerificationEntry>();
  for (const entry of newestFirst) {
    const key = entry.code.value.toLowerCase();
    if (!byValue.has(key)) byValue.set(key, entry);
  }

  return [...byValue.values()].slice(0, MAX_ENTRIES);
}
