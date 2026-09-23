import type { ListedMessage } from "../api/types";
import type { Presence, PresenceState } from "../hooks/presence";
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

export interface CategoryGroupPresence {
  /** `account:category` — so an account switch is one group leaving and another
   *  arriving, never one group whose rows change owner underneath its heading. */
  key: string;
  accountId: string;
  category: CategoryName;
  rows: Presence<ListedMessage>[];
  /** What the heading counts and acts on: the rows staying, or — for a group on
   *  its way out — the rows it is leaving with, so its count does not tick down
   *  mid-exit. */
  messages: ListedMessage[];
  /** A group is leaving once every row in it is. */
  state: PresenceState;
}

/**
 * A section's merged presence list, split into category groups *per account*.
 *
 * `groupByCategory` alone is right for one account and wrong across a switch:
 * the rows of the account being left are still on screen, leaving, while the
 * next account's arrive, and grouping them by category alone put both into one
 * group — a heading counting two mailboxes at once, acting on the one being
 * left, and never animating in or out itself because it never came or went.
 *
 * Accounts keep the order their rows are in, which puts the account being left
 * first: its rows stay in place and the incoming ones append, as they did
 * before there were groups.
 */
export const groupPresenceByCategory = (
  presence: Presence<ListedMessage>[],
): CategoryGroupPresence[] => {
  const byAccount = new Map<string, Presence<ListedMessage>[]>();
  for (const p of presence) {
    const bucket = byAccount.get(p.item.accountId);
    if (bucket) bucket.push(p);
    else byAccount.set(p.item.accountId, [p]);
  }

  return [...byAccount.entries()].flatMap(([accountId, accountRows]) =>
    groupByCategory(accountRows.map((p) => p.item)).map(({ category }) => {
      const rows = accountRows.filter((p) => categoryOf(p.item) === category);
      const staying = rows.filter((p) => p.state === "present");
      const state: PresenceState = staying.length === 0 ? "leaving" : "present";
      return {
        key: `${accountId}:${category}`,
        accountId,
        category,
        rows,
        messages: (state === "leaving" ? rows : staying).map((p) => p.item),
        state,
      };
    }),
  );
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
