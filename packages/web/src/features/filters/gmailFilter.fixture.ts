import type { Account, GmailFilter, Label } from "../../api/types";

/** The mailbox the fixtures below belong to. */
export const ACCOUNT: Account = {
  id: "acc-1",
  email: "you@example.com",
  displayName: "You",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: null,
};

/**
 * One synced Gmail filter, with every field filled in and any of them
 * overridable.
 *
 * Lives beside the filters feature rather than inside one test file because the
 * selection and merge suites both render `AccountFiltersSection` over a list of
 * these, and would otherwise each carry their own copy of a shape that grows.
 */
export function gmailFilter(over: Partial<GmailFilter> = {}): GmailFilter {
  return {
    id: "row-1",
    accountId: ACCOUNT.id,
    gmailFilterId: "f-1",
    criteria: { from: "sender@example.com" },
    action: { addLabelIds: ["L_NEWS"] },
    syncedAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

/** A label the filters' actions can point at, as the labels query returns it. */
export function gmailLabel(over: Partial<Label> = {}): Label {
  return {
    id: "label-row-1",
    accountId: ACCOUNT.id,
    gmailLabelId: "L_NEWS",
    name: "News",
    type: "user",
    colorBg: null,
    colorFg: null,
    ...over,
  };
}
