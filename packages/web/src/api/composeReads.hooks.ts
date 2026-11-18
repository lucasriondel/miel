import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";

/**
 * The compose window's reads: what a reply quotes and a forward carries, which
 * addresses a mailbox may send as, and the people it has written to. Each is
 * its own key root — none of them is a message list, so nothing a message
 * action invalidates should re-read them.
 */

/** One block the server will put under what the user typed. */
export interface QuoteBlock {
  /** "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@…> wrote:" */
  attribution: string;
  text: string;
  html: string;
}

export interface QuoteAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface MessageQuote {
  /** Exactly what `send-reply` appends unless told not to. */
  reply: QuoteBlock;
  /** The header block and original a forward carries. */
  forward: QuoteBlock;
  /** The original's files: a forward's chips before anyone removes one. */
  attachments: QuoteAttachment[];
}

export const quoteQueryKey = (accountId: string, gmailMessageId: string) =>
  ["message-quote", accountId, gmailMessageId] as const;

export function messageQuoteQueryOptions(accountId: string, gmailMessageId: string) {
  return {
    queryKey: quoteQueryKey(accountId, gmailMessageId),
    queryFn: () =>
      apiFetch<MessageQuote>({ path: `/messages/${accountId}/${gmailMessageId}/quote` }),
    // A stored message does not change under its quote.
    staleTime: Infinity,
  };
}

/** Only for a window answering a message: a new mail quotes nothing. */
export function useMessageQuote(target: { accountId: string; gmailMessageId: string } | null) {
  return useQuery({
    ...messageQuoteQueryOptions(target?.accountId ?? "", target?.gmailMessageId ?? ""),
    enabled: target !== null,
  });
}

export interface SendAsAlias {
  email: string;
  displayName: string | null;
  isPrimary: boolean;
  isDefault: boolean;
  /** Only a verified alias is accepted as `from`; Gmail would rewrite any other. */
  verified: boolean;
}

export const sendAsQueryKey = (accountId: string) => ["send-as", accountId] as const;

export function useSendAs(accountId: string | null) {
  return useQuery({
    queryKey: sendAsQueryKey(accountId ?? ""),
    queryFn: () => apiFetch<{ aliases: SendAsAlias[] }>({ path: `/accounts/${accountId}/send-as` }),
    enabled: accountId !== null,
    staleTime: 5 * 60_000,
  });
}

export interface ContactSuggestion {
  email: string;
  name: string | null;
  timesContacted: number;
  lastContactedAt: string | null;
}

/** How many suggestions the list under a field shows. */
export const SUGGESTION_LIMIT = 6;

export const contactsQueryKey = (accountId: string, q: string) =>
  ["contacts", accountId, q] as const;

/**
 * "People you've emailed" matching what is being typed. Asked only once
 * something is typed — an empty field is not a question — and the previous
 * answer stays up while the next one is on its way, so the list does not blink
 * on every keystroke.
 */
export function useContactSuggestions(accountId: string, q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: contactsQueryKey(accountId, query),
    queryFn: () =>
      apiFetch<{ items: ContactSuggestion[] }>({
        path: `/accounts/${accountId}/contacts`,
        query: { q: query, limit: SUGGESTION_LIMIT },
      }),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
