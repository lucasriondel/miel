import type { Label } from "../../api/types";

/**
 * Which of an account's labels the picker offers, and in what order (#169).
 *
 * Pure, so what the filter field does to the list is assertable without a DOM:
 * the two faces of the picker both go through it, and a query is the only thing
 * that varies between an open panel and the same panel one keystroke later.
 *
 * Gmail's own mailboxes are left out wherever the picker is opened from —
 * putting INBOX or SENT on a message is not what "label" means — and the match
 * is a case-insensitive substring of the whole name rather than of its last
 * segment, so a nested label answers to the parent someone remembers
 * (`Clients/Acme` for "clients") as readily as to its own.
 */
export const offeredLabels = (labels: readonly Label[], query: string): Label[] => {
  const needle = query.trim().toLowerCase();
  return labels
    .filter((l) => l.type !== "system")
    .filter((l) => needle.length === 0 || l.name.toLowerCase().includes(needle))
    .toSorted((a, b) => a.name.localeCompare(b.name));
};
