import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./client";
import type { GenerateReplyResult } from "./mutations";

/**
 * The compose window's requests that are not an action on a stored message's
 * row: sending a new mail, forwarding one, scheduling either, drafting with the
 * AI (and stopping it), and the Gmail draft the window autosaves into.
 *
 * Option factories beside their hooks, like `schedule.hooks.ts`, so the request
 * shapes are assertable at the React Query seam without a render.
 */

/** What every send names beside its recipients and text. */
export interface OutgoingExtras {
  /** A verified send-as alias of the sending mailbox; absent sends as the mailbox itself. */
  from?: string;
  /** Staged uploads, in chip order. */
  uploadIds?: string[];
  /** The autosaved Gmail draft, which the server deletes once the mail is out. */
  draftId?: string;
}

export interface SendNewMessageInput extends OutgoingExtras {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

export interface SendResult {
  ok: true;
  sentMessageId: string;
  /** The thread Gmail filed it in — what a "View in Gmail" link needs. */
  threadId: string;
}

export type SendNewMessageResult = SendResult;

/** Omitted rather than empty: an empty list is no list, and the schema treats a named one as meant. */
const listField = (name: string, list: string[] | undefined) =>
  list && list.length > 0 ? { [name]: list } : {};

const extras = (input: OutgoingExtras) => ({
  ...(input.from ? { from: input.from } : {}),
  ...listField("uploadIds", input.uploadIds),
  ...(input.draftId ? { draftId: input.draftId } : {}),
});

export function sendNewMessageMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: SendNewMessageInput) =>
      apiFetch<SendNewMessageResult>({
        path: "/compose/send",
        method: "POST",
        body: {
          accountId: input.accountId,
          to: input.to,
          ...listField("cc", input.cc),
          ...listField("bcc", input.bcc),
          subject: input.subject,
          body: input.body,
          ...extras(input),
        },
      }),
    // Sync excludes sent mail, so nothing on screen lists it; the lists are
    // re-read only because a reply to it may already be arriving in the thread.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages"] });
    },
  };
}

export function useSendNewMessage() {
  const qc = useQueryClient();
  return useMutation(sendNewMessageMutationOptions(qc));
}

export interface ForwardMessageInput extends OutgoingExtras {
  accountId: string;
  gmailMessageId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Only what the user typed: the server writes the forwarded block under it. */
  body: string;
  /** The original's files still on the window; a removed chip is simply not named. */
  keepAttachmentIds: string[];
}

/**
 * A forward is the server's to build — the typed text, the "Forwarded message"
 * block, the original's files fetched from Gmail, then the uploads — so the
 * window sends only the user's own words and which chips it kept.
 */
export function forwardMessageMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: ForwardMessageInput) =>
      apiFetch<SendResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/forward`,
        method: "POST",
        body: {
          to: input.to,
          ...listField("cc", input.cc),
          ...listField("bcc", input.bcc),
          subject: input.subject,
          body: input.body,
          keepAttachmentIds: input.keepAttachmentIds,
          ...extras(input),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages"] });
    },
  };
}

/** A draft the window had before: the model edits it rather than starting over. */
export interface PreviousDraft {
  subject?: string;
  body: string;
}

export interface GenerateMessageInput {
  accountId: string;
  prompt: string;
  /** What has been typed so far, as hints. */
  to?: string[];
  subject?: string;
  previousDraft?: PreviousDraft;
  /** Chosen by the window, so Stop can name the generation it means. */
  requestId?: string;
  /** Aborting the request also stops the generation on the server. */
  signal?: AbortSignal;
}

/** The refinement fields both generation routes take, omitted when absent. */
export const generationExtras = (input: { previousDraft?: PreviousDraft; requestId?: string }) => ({
  ...(input.previousDraft && input.previousDraft.body.trim().length > 0
    ? { previousDraft: input.previousDraft }
    : {}),
  ...(input.requestId ? { requestId: input.requestId } : {}),
});

export function generateMessageMutationOptions() {
  return {
    mutationFn: async (input: GenerateMessageInput) =>
      apiFetch<GenerateReplyResult>({
        path: "/compose/generate",
        method: "POST",
        body: {
          accountId: input.accountId,
          prompt: input.prompt,
          ...listField("to", input.to),
          ...(input.subject ? { subject: input.subject } : {}),
          ...generationExtras(input),
        },
        signal: input.signal,
      }),
  };
}

export function useGenerateMessage() {
  return useMutation(generateMessageMutationOptions());
}

/** Stop: the server kills the provider call running under `requestId`. */
export const cancelGeneration = (requestId: string) =>
  apiFetch<{ ok: true; cancelled: boolean }>({
    path: `/compose/generations/${encodeURIComponent(requestId)}/cancel`,
    method: "POST",
  });

/** A generation someone stopped answers 409 `generation_cancelled`: news, not a failure. */
export const isGenerationCancelled = (err: unknown): boolean =>
  err instanceof ApiError && err.status === 409 && err.message === "generation_cancelled";

export type ScheduledKind = "new" | "reply" | "forward";

export interface ScheduleSendInput extends OutgoingExtras {
  accountId: string;
  kind: ScheduledKind;
  /** The message a reply or a forward answers. */
  sourceGmailMessageId?: string;
  sendAt: Date;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  keepAttachmentIds?: string[];
  replyAll?: boolean;
  includeQuote?: boolean;
  quotedText?: string;
}

export interface ScheduledSendCreated {
  id: string;
  sendAt: string;
  status: string;
}

/**
 * Schedule send. Gmail's API has none, so miel holds the request and sends it
 * itself when it is due; everything that can be checked is checked now, so a
 * refusal arrives while the user is still looking at the window.
 */
export function scheduleSendMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: ScheduleSendInput) =>
      apiFetch<ScheduledSendCreated>({
        path: "/compose/scheduled",
        method: "POST",
        body: {
          accountId: input.accountId,
          kind: input.kind,
          ...(input.sourceGmailMessageId
            ? { sourceGmailMessageId: input.sourceGmailMessageId }
            : {}),
          sendAt: input.sendAt.toISOString(),
          to: input.to,
          ...listField("cc", input.cc),
          ...listField("bcc", input.bcc),
          subject: input.subject,
          body: input.body,
          ...(input.keepAttachmentIds ? { keepAttachmentIds: input.keepAttachmentIds } : {}),
          ...(input.replyAll ? { replyAll: true } : {}),
          ...(input.includeQuote === false ? { includeQuote: false } : {}),
          ...(input.quotedText !== undefined ? { quotedText: input.quotedText } : {}),
          ...extras(input),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scheduled-sends"] });
    },
  };
}

/** The toast's Undo: a pending send is cancelled and nothing goes. */
export const cancelScheduledSendRequest = (id: string) =>
  apiFetch<unknown>({ path: `/compose/scheduled/${id}`, method: "DELETE" });

export interface SaveDraftInput {
  accountId: string;
  /** Absent creates the Gmail draft; named, the server replaces it. */
  draftId?: string;
  /** A reply's draft is filed in the thread of the message it answers. */
  replyToGmailMessageId?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  from?: string;
  uploadIds?: string[];
  /** A reply's draft carries the quote the send will carry, trimmed as on screen. */
  includeQuote?: boolean;
  quotedText?: string;
}

export interface SaveDraftResult {
  ok: true;
  draftId: string;
  savedAt: string;
}

/** Plain functions rather than hooks: the autosave owns its own timing and in-flight state. */
export const saveDraft = (input: SaveDraftInput) =>
  apiFetch<SaveDraftResult>({
    path: "/compose/drafts",
    method: "PUT",
    body: {
      accountId: input.accountId,
      ...(input.draftId ? { draftId: input.draftId } : {}),
      ...(input.replyToGmailMessageId
        ? { replyToGmailMessageId: input.replyToGmailMessageId }
        : {}),
      to: input.to,
      ...listField("cc", input.cc),
      ...listField("bcc", input.bcc),
      subject: input.subject,
      body: input.body,
      ...(input.from ? { from: input.from } : {}),
      ...listField("uploadIds", input.uploadIds),
      ...(input.includeQuote === false ? { includeQuote: false } : {}),
      ...(input.quotedText !== undefined ? { quotedText: input.quotedText } : {}),
    },
  });

export const deleteDraft = (accountId: string, draftId: string) =>
  apiFetch<{ ok: true }>({
    path: `/compose/drafts/${accountId}/${encodeURIComponent(draftId)}`,
    method: "DELETE",
  });
