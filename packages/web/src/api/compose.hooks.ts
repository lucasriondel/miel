import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { GenerateReplyResult } from "./mutations";

/**
 * The compose window's requests that answer no stored message: sending a new
 * mail, drafting one with the AI, and the Gmail draft it autosaves into.
 *
 * Option factories beside their hooks, like `schedule.hooks.ts`, so the request
 * shapes are assertable at the React Query seam without a render.
 */

export interface SendNewMessageInput {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** The autosaved Gmail draft, which the server deletes once the mail is sent. */
  draftId?: string;
}

export interface SendNewMessageResult {
  ok: true;
  sentMessageId: string;
  /** The thread Gmail started for it — what a "View in Gmail" link needs. */
  threadId: string;
}

/** Omitted rather than empty: an empty list is no list, and the schema treats a named one as meant. */
const listField = (name: string, list: string[] | undefined) =>
  list && list.length > 0 ? { [name]: list } : {};

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
          ...(input.draftId ? { draftId: input.draftId } : {}),
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

export interface GenerateMessageInput {
  accountId: string;
  prompt: string;
  /** What has been typed so far, as hints. */
  to?: string[];
  subject?: string;
  /** Aborts the request on the client. The provider call keeps running on the server. */
  signal?: AbortSignal;
}

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
        },
        signal: input.signal,
      }),
  };
}

export function useGenerateMessage() {
  return useMutation(generateMessageMutationOptions());
}

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
    },
  });

export const deleteDraft = (accountId: string, draftId: string) =>
  apiFetch<{ ok: true }>({
    path: `/compose/drafts/${accountId}/${encodeURIComponent(draftId)}`,
    method: "DELETE",
  });
