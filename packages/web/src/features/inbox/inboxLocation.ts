/**
 * The inbox's scope lives in the URL, not in state: `useDateRange` re-derives
 * the view mode and the period from `?view`/`?range` on every render, and the
 * sidebar's label selection is seeded from `?label`. A URL without them is a
 * reset inbox — so opening a message has to carry them along, and returning
 * has to land on a URL that still has them.
 *
 * These are pure functions over the query string so the rule lives in one
 * place: only these three params travel, and nothing else does. A connect
 * outcome (`?connected=…`) riding along would re-toast on arrival and again on
 * the way back.
 */
const INBOX_SCOPE_PARAMS = ["view", "range", "label"] as const;

/** `search` reduced to the inbox's scope, in a canonical order (or ""). */
export function inboxSearch(search: string): string {
  const from = new URLSearchParams(search);
  const scope = new URLSearchParams();
  for (const param of INBOX_SCOPE_PARAMS) {
    const value = from.get(param);
    if (value !== null && value !== "") scope.set(param, value);
  }
  const query = scope.toString();
  return query ? `?${query}` : "";
}

/** Where a message row points: the message, under the inbox it was opened from. */
export function messageDetailPath(
  accountId: string,
  gmailMessageId: string,
  search: string,
): string {
  return `/account/${accountId}/messages/${gmailMessageId}${inboxSearch(search)}`;
}

/** The inbox URL for an account, with the scope in `search` restored onto it. */
export function inboxPath(accountId: string | undefined, search: string): string {
  const base = accountId ? `/account/${accountId}` : "/";
  return `${base}${inboxSearch(search)}`;
}

/** How to leave a message: back through history, or onto a rebuilt inbox URL. */
export type InboxReturnTarget = { kind: "back" } | { kind: "to"; to: string };

/**
 * Leaving a message prefers `back`, because the entry behind it is the inbox
 * itself — its filters, and the scroll offset saved against its history key.
 * Rebuilding the URL would push a second entry and restore neither.
 *
 * `default` is the key react-router gives the first entry of a session, so a
 * deep link, a new tab or a reload on the message has nothing behind it. There
 * we rebuild, from the scope the URL is still carrying.
 */
export function inboxReturnTarget(input: {
  locationKey: string;
  accountId: string | undefined;
  search: string;
}): InboxReturnTarget {
  if (input.locationKey !== "default") return { kind: "back" };
  return { kind: "to", to: inboxPath(input.accountId, input.search) };
}
