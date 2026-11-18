/**
 * Which list the inbox page shows. `done` is Gmail's archive — the Done view —
 * read with `archivedOnly`; it rides in the URL as `?mailbox=done` beside the
 * period, so a message opened from it returns to it.
 */
export type Mailbox = "inbox" | "done";

export const mailboxFromSearch = (search: string): Mailbox =>
  new URLSearchParams(search).get("mailbox") === "done" ? "done" : "inbox";
