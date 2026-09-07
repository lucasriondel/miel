import type { MessageDetail } from "./types";

/**
 * The message the detail page shows, with every field filled in and any of them
 * overridable — the `listedMessage` fixture's twin.
 *
 * It lives beside the api modules for the same reason that one does: the
 * mutations write this cache optimistically now (#145), so the suites that
 * assert what a user sees on the page all seed a `["message", …]` entry and
 * would otherwise each carry a copy of the twenty-odd fields `MessageDetail`
 * has.
 */
export function messageDetail(over: Partial<MessageDetail> = {}): MessageDetail {
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
    bodyText: null,
    bodyHtml: null,
    internalDate: "2026-08-01T00:00:00.000Z",
    isArchived: false,
    isTrashed: false,
    rawHeaders: null,
    labels: [],
    attachments: [],
    latestTriageId: null,
    triageHistory: [],
    ...over,
  };
}

/** One triage run, newest-first in `triageHistory`. */
export function triageRun(
  over: Partial<MessageDetail["triageHistory"][number]> = {},
): MessageDetail["triageHistory"][number] {
  return {
    id: "tr-1",
    priority: "low",
    reasoning: "Routine mail.",
    model: "claude-haiku-4-5",
    createdAt: "2026-08-01T00:00:00.000Z",
    existingLabelSuggestions: [],
    newLabelSuggestions: [],
    ...over,
  };
}
