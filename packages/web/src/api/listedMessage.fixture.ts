import type { ListedMessage } from "./types";

/**
 * A cached inbox row, with every field filled in and any of them overridable.
 *
 * Lives beside the api modules rather than inside one test file because the
 * mutation suites all seed the same `["messages", params]` cache and would
 * otherwise each carry their own copy of the twenty-odd fields `ListedMessage`
 * has — copies that drift apart as the type grows.
 */
export function listedMessage(over: Partial<ListedMessage> = {}): ListedMessage {
  return {
    accountId: "acc-1",
    accountEmail: "a@example.com",
    gmailMessageId: "msg-1",
    gmailThreadId: "th-1",
    fromEmail: "sender@example.com",
    fromName: null,
    toEmails: [],
    subject: null,
    snippet: null,
    internalDate: "2026-08-01T00:00:00.000Z",
    isArchived: false,
    isTrashed: false,
    priority: null,
    triageId: null,
    labels: [],
    attachments: [],
    pendingSuggestions: { existing: [], new: [] },
    ...over,
  };
}
