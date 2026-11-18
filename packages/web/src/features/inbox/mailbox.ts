/**
 * Which list the inbox page shows. `done` is Gmail's archive — the Done view —
 * read with `archivedOnly`; `snoozed` is the Snoozed view, read with
 * `snoozedOnly` and not scoped to the period, since what matters about a
 * snoozed message is when it comes back rather than when it arrived. Both ride
 * in the URL as `?mailbox=…` beside the period, so a message opened from one
 * returns to it.
 */
export type Mailbox = "inbox" | "done" | "snoozed";

export const mailboxFromSearch = (search: string): Mailbox => {
  const value = new URLSearchParams(search).get("mailbox");
  return value === "done" || value === "snoozed" ? value : "inbox";
};
