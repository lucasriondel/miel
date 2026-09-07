import type { ListedMessage } from "../api/types";
import { mailboxOrderIndex } from "../components/systemLabels";

/** The Gmail system labels a message is grouped under, in `MAILBOX_ORDER`'s order. */
const CATEGORY_NAMES = [
  "CATEGORY_PERSONAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
  "CATEGORY_SOCIAL",
] as const;

export type CategoryName = (typeof CATEGORY_NAMES)[number];

const CATEGORY_SET: ReadonlySet<string> = new Set(CATEGORY_NAMES);

/**
 * Gmail files a message into exactly one inbox category, but it does not always
 * say so: a message with no `CATEGORY_*` label at all is a Primary one that
 * Gmail never bothered to tag, which is most of them on an account with the
 * category tabs turned off. Treating that as its own "no category" group would
 * split Primary in two, so the fallback *is* Primary.
 */
export const categoryOf = (message: ListedMessage): CategoryName => {
  const found = message.labels.find((l) => CATEGORY_SET.has(l.name));
  return (found?.name as CategoryName | undefined) ?? "CATEGORY_PERSONAL";
};

export interface CategoryGroup {
  category: CategoryName;
  messages: ListedMessage[];
}

/**
 * Splits one priority section's messages into its category subgroups (req. 4).
 *
 * Order is `MAILBOX_ORDER`'s, the same sequence the sidebar lists its mailboxes
 * in, so a category sits in the same place wherever it is drawn. Within a group
 * the messages keep the order they arrived in — the list is already sorted, and
 * re-sorting here would quietly override it.
 *
 * Empty groups are dropped rather than rendered empty: a section shows the
 * categories it actually has.
 */
export const groupByCategory = (messages: ListedMessage[]): CategoryGroup[] => {
  const groups = new Map<CategoryName, ListedMessage[]>();
  for (const m of messages) {
    const category = categoryOf(m);
    const bucket = groups.get(category);
    if (bucket) bucket.push(m);
    else groups.set(category, [m]);
  }
  return [...groups.entries()]
    .map(([category, msgs]) => ({ category, messages: msgs }))
    .toSorted((a, b) => mailboxOrderIndex(a.category) - mailboxOrderIndex(b.category));
};

/**
 * The one-line sender run a collapsed group previews (req. 7).
 *
 * Each sender appears once, at the position of their newest message, the way
 * Google Inbox showed it: the run has one line to spend and a thread of six
 * replies would otherwise spend all of it on one name. The truncation is the
 * CSS's — this returns the whole run and lets the ellipsis fall where the width
 * puts it, so a wider window shows more names without a second rule about how
 * many.
 */
export const senderRun = (messages: ListedMessage[]): string[] => {
  const seen = new Set<string>();
  const run: string[] = [];
  for (const m of messages) {
    const name = m.fromName?.trim() || m.fromEmail;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    run.push(name);
  }
  return run;
};
