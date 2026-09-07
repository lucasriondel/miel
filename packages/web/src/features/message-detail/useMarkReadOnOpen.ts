import { useEffect, useRef } from "react";
import { useSetMessageRead } from "../../api/mutations";
import type { MessageDetail } from "../../api/types";

/**
 * Opening a message marks it as read (#142).
 *
 * `UNREAD` is a Gmail label, and until now the only things that ever cleared it
 * were explicit clicks — the toggle, the section header, the bulk bar — so a
 * message the user had just read stayed bold in the inbox. This clears it on
 * open, immediately rather than after a dwell, through the same mutation the
 * toggle uses: the row behind the page unbolds optimistically, and a refusal
 * puts it back with no toast, since nobody asked for this.
 *
 * The ref is what makes it fire once, and what it records is the message this
 * hook has *considered* — not the one it acted on. `isUnread` is read off a
 * cache the mutation rewrites, a refetch writes again and the toggle in the top
 * bar writes too, so the effect re-runs for every reason except the one that
 * matters. Deciding on the open rather than on each sighting of the label is
 * also what keeps "Mark as unread" working while the message is on screen: an
 * unread label the reader has just asked for would otherwise be cleared again
 * on the spot.
 *
 * One slot, not a set: leaving a message and coming back to it is a fresh open,
 * and if the first attempt was refused there is a label there still to clear.
 */
export function useMarkReadOnOpen(message: MessageDetail | undefined): void {
  const { mutate } = useSetMessageRead();
  const considered = useRef<string | null>(null);

  const accountId = message?.accountId;
  const gmailMessageId = message?.gmailMessageId;
  const isUnread = message?.labels.some((l) => l.name === "UNREAD") ?? false;

  useEffect(() => {
    // Nothing to decide until the message is there: the effect re-runs when the
    // query resolves, and that first sight of it is the open.
    if (!accountId || !gmailMessageId) return;
    const opened = `${accountId}/${gmailMessageId}`;
    if (considered.current === opened) return;
    considered.current = opened;
    if (!isUnread) return;
    mutate({ accountId, gmailMessageId, read: true });
  }, [accountId, gmailMessageId, isUnread, mutate]);
}
