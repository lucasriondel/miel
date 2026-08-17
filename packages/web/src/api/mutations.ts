import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type {
  ListedMessage,
  ModelSettings,
  SuggestFilterForMessageResult,
  TriageBatchSettings,
} from "./types";
import { messageMutationOptions, sameMessage, type OptimisticPlan } from "./messageMutation";
import { updateScheduleMutationOptions } from "./schedule.hooks";

/**
 * The message mutations, each as a plain options object plus the hook that
 * feeds it a query client.
 *
 * The options seam is what makes them testable without a DOM render (the same
 * one `schedule.hooks.ts` uses), and `messageMutationOptions` is what keeps them
 * short: cancelling, snapshotting, rolling back, re-reading and the two shapes
 * the messages cache holds are its business, not theirs. What is left here is
 * the route, the optimistic shape of a row, and anything else the change
 * invalidates.
 */

export interface MessageActionResult {
  ok: true;
  threadId: string;
}

export interface MessageActionInput {
  accountId: string;
  gmailMessageId: string;
}

// Archiving and trashing act on the whole thread (Gmail does, and the backend
// marks every message in it), so the siblings of the message acted on have to
// go with it — otherwise they re-appear on the next refetch, seconds after the
// row above them vanished. This is why an optimistic plan is handed every
// cached message: the siblings live in other queries and other pages.
const hideWholeThread: OptimisticPlan<MessageActionInput> = (input, cached) => {
  const threadIds = new Set(
    cached.filter((m) => sameMessage(m, input)).map((m) => m.gmailThreadId),
  );
  return (m) => (m.accountId === input.accountId && threadIds.has(m.gmailThreadId) ? null : m);
};

export function archiveMessageMutationOptions(qc: QueryClient) {
  return messageMutationOptions<MessageActionInput, MessageActionResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/archive`,
      method: "POST",
    }),
    optimistic: hideWholeThread,
    listsAreAuthoritative: true,
  });
}

export function useArchiveMessage() {
  const qc = useQueryClient();
  return useMutation(archiveMessageMutationOptions(qc));
}

/**
 * Trashing a message.
 *
 * Every caller — the inbox row, the verification-code pill, the message-detail
 * confirmation panel — goes through this, so they share one route, one bearer
 * token and one set of invalidations.
 */
export function trashMessageMutationOptions(qc: QueryClient) {
  return messageMutationOptions<MessageActionInput, MessageActionResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}`,
      method: "DELETE",
    }),
    optimistic: hideWholeThread,
    // The *lists* aren't re-read on success — the optimistic removal is the
    // truth there. The detail query is a different matter, and the factory
    // invalidates it either way: nothing optimistic touches it, so without that
    // the cached message keeps reporting `isTrashed: false` to whoever
    // navigates back to it.
    listsAreAuthoritative: true,
  });
}

export function useTrashMessage() {
  const qc = useQueryClient();
  return useMutation(trashMessageMutationOptions(qc));
}

export interface SetMessageReadInput extends MessageActionInput {
  read: boolean;
}

export interface SetMessageReadResult {
  ok: true;
  read: boolean;
}

const UNREAD_LABEL: ListedMessage["labels"][number] = {
  id: "__unread__",
  name: "UNREAD",
  gmailLabelId: "UNREAD",
  colorBg: null,
  colorFg: null,
};

/** Add or drop the UNREAD label, leaving a row that already reads that way alone. */
function withUnread(m: ListedMessage, unread: boolean): ListedMessage {
  const hasUnread = m.labels.some((l) => l.name === "UNREAD");
  if (unread === hasUnread) return m;
  return unread
    ? { ...m, labels: [UNREAD_LABEL, ...m.labels] }
    : { ...m, labels: m.labels.filter((l) => l.name !== "UNREAD") };
}

export function setMessageReadMutationOptions(qc: QueryClient) {
  return messageMutationOptions<SetMessageReadInput, SetMessageReadResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/read`,
      method: "POST",
      body: { read: input.read },
    }),
    optimistic: (input) => (m) => (sameMessage(m, input) ? withUnread(m, !input.read) : m),
  });
}

export function useSetMessageRead() {
  const qc = useQueryClient();
  return useMutation(setMessageReadMutationOptions(qc));
}

export interface GenerateReplyInput extends MessageActionInput {
  prompt: string;
}

export interface GenerateReplyResult {
  subject: string;
  body: string;
  model: string;
  runId: string;
}

// Drafting a reply changes nothing — no row moves, no label appears, and the
// message is exactly as it was — so this is a request and no choreography.
export function generateReplyMutationOptions() {
  return {
    mutationFn: async (input: GenerateReplyInput) =>
      apiFetch<GenerateReplyResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/generate-reply`,
        method: "POST",
        body: { prompt: input.prompt },
      }),
  };
}

export function useGenerateReply() {
  return useMutation(generateReplyMutationOptions());
}

export interface SendReplyInput extends MessageActionInput {
  subject: string;
  body: string;
  /**
   * Edited in the compose window (#96). Omitted, the server addresses the reply
   * from the stored message as it always did — which is what the CLI relies on.
   */
  to?: string[];
  cc?: string[];
}

export interface SendReplyResult {
  ok: true;
  sentMessageId: string;
}

// Sending has no optimistic shape — the sent message is the server's to
// describe — so the lists and the thread are simply re-read afterwards.
export function sendReplyMutationOptions(qc: QueryClient) {
  return messageMutationOptions<SendReplyInput, SendReplyResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/send-reply`,
      method: "POST",
      body: {
        subject: input.subject,
        body: input.body,
        ...(input.to ? { to: input.to } : {}),
        ...(input.cc ? { cc: input.cc } : {}),
      },
    }),
  });
}

export function useSendReply() {
  const qc = useQueryClient();
  return useMutation(sendReplyMutationOptions(qc));
}

export type BatchMessageAction = "read" | "unread" | "archive" | "trash";

export interface BatchMessageActionInput {
  accountId: string;
  gmailMessageIds: string[];
  action: BatchMessageAction;
}

export interface BatchMessageActionResult {
  ok: true;
  action: BatchMessageAction;
  count: number;
}

export function batchMessageActionMutationOptions(qc: QueryClient) {
  return messageMutationOptions<BatchMessageActionInput, BatchMessageActionResult>(qc, {
    request: (input) => ({
      path: "/messages/batch",
      method: "POST",
      body: {
        accountId: input.accountId,
        gmailMessageIds: input.gmailMessageIds,
        action: input.action,
      },
    }),
    optimistic: (input) => {
      const ids = new Set(input.gmailMessageIds);
      const selected = (m: ListedMessage) =>
        m.accountId === input.accountId && ids.has(m.gmailMessageId);
      if (input.action === "archive" || input.action === "trash") {
        return (m) => (selected(m) ? null : m);
      }
      return (m) => (selected(m) ? withUnread(m, input.action === "unread") : m);
    },
    // Read/unread is authoritative here for the same reason a removal is: a
    // success refetch would race the other mutations a bulk selection fires.
    listsAreAuthoritative: true,
  });
}

export function useBatchMessageAction() {
  const qc = useQueryClient();
  return useMutation(batchMessageActionMutationOptions(qc));
}

export type ApplyLabelSuggestionInput = MessageActionInput & {
  triageId: string;
} & (
    | {
        kind: "existing";
        labelId: string;
        name: string;
        colorBg: string | null;
        colorFg: string | null;
      }
    | { kind: "new"; suggestionId: string }
  );

export interface ApplyLabelSuggestionResult {
  ok: true;
  appliedExistingLabelIds: string[];
  createdLabels: { suggestionId: string; labelId: string; name: string }[];
  attached: { gmailLabelId: string; name: string }[];
}

/**
 * Accepting one label suggestion.
 *
 * An existing label can be attached optimistically because it is already
 * known; a new one is created server-side, so only the suggestion that produced
 * it can be cleared. Either way the account's label list is stale too.
 */
export function applyLabelSuggestionMutationOptions(qc: QueryClient) {
  return messageMutationOptions<ApplyLabelSuggestionInput, ApplyLabelSuggestionResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/apply-suggestions`,
      method: "POST",
      body: {
        triageId: input.triageId,
        acceptExistingLabelIds: input.kind === "existing" ? [input.labelId] : undefined,
        acceptNewSuggestionIds: input.kind === "new" ? [input.suggestionId] : undefined,
      },
    }),
    optimistic: (input) => (m) => {
      if (!sameMessage(m, input)) return m;
      if (input.kind === "new") {
        return {
          ...m,
          pendingSuggestions: {
            ...m.pendingSuggestions,
            new: m.pendingSuggestions.new.filter((s) => s.suggestionId !== input.suggestionId),
          },
        };
      }
      const alreadyApplied = m.labels.some((l) => l.id === input.labelId);
      return {
        ...m,
        labels: alreadyApplied
          ? m.labels
          : [
              ...m.labels,
              {
                id: input.labelId,
                name: input.name,
                gmailLabelId: input.labelId,
                colorBg: input.colorBg,
                colorFg: input.colorFg,
              },
            ],
        pendingSuggestions: {
          ...m.pendingSuggestions,
          existing: m.pendingSuggestions.existing.filter((s) => s.labelId !== input.labelId),
        },
      };
    },
    alsoInvalidate: (input) => [queryKeys.labels(input.accountId)],
  });
}

export function useApplyLabelSuggestion() {
  const qc = useQueryClient();
  return useMutation(applyLabelSuggestionMutationOptions(qc));
}

export interface RemoveMessageLabelInput extends MessageActionInput {
  labelId: string;
}

export interface RemoveMessageLabelResult {
  ok: true;
  added: { labelId: string; gmailLabelId: string; name: string }[];
  removed: { labelId: string; gmailLabelId: string; name: string }[];
}

export function removeMessageLabelMutationOptions(qc: QueryClient) {
  return messageMutationOptions<RemoveMessageLabelInput, RemoveMessageLabelResult>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/labels`,
      method: "POST",
      body: { remove: [input.labelId] },
    }),
    optimistic: (input) => (m) =>
      sameMessage(m, input) ? { ...m, labels: m.labels.filter((l) => l.id !== input.labelId) } : m,
  });
}

export function useRemoveMessageLabel() {
  const qc = useQueryClient();
  return useMutation(removeMessageLabelMutationOptions(qc));
}

export interface SetMessagePriorityInput extends MessageActionInput {
  priority: "high" | "medium" | "low";
}

export function setMessagePriorityMutationOptions(qc: QueryClient) {
  return messageMutationOptions<SetMessagePriorityInput, { ok: true }>(qc, {
    request: (input) => ({
      path: `/messages/${input.accountId}/${input.gmailMessageId}/priority`,
      method: "POST",
      body: { priority: input.priority },
    }),
    optimistic: (input) => (m) => (sameMessage(m, input) ? { ...m, priority: input.priority } : m),
  });
}

export function useSetMessagePriority() {
  const qc = useQueryClient();
  return useMutation(setMessagePriorityMutationOptions(qc));
}

export interface SuggestSimilarFilterInput extends MessageActionInput {
  prompt?: string;
}

// The suggestion lands in the filters list, not on the message: nothing about
// the message changed, so neither the lists nor the detail are re-read. Another
// request with no choreography to own.
export function suggestSimilarFilterMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: SuggestSimilarFilterInput) =>
      apiFetch<SuggestFilterForMessageResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/filter-suggest`,
        method: "POST" as const,
        body: input.prompt ? { prompt: input.prompt } : {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["filters"] });
    },
  };
}

export function useSuggestSimilarFilter() {
  const qc = useQueryClient();
  return useMutation(suggestSimilarFilterMutationOptions(qc));
}

// A patch of the picker: either half of a task's pair, for any of the three
// tasks. Naming a provider and no model is meaningful — the server then picks
// that vendor's default (#105).
export type UpdateSettingsInput = Partial<ModelSettings>;

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSettingsInput) =>
      apiFetch<ModelSettings>({
        path: "/settings",
        method: "PUT",
        body: input,
      }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.settings, data);
    },
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation(updateScheduleMutationOptions(qc));
}

export interface UpdateTriageBatchSettingsInput {
  batchSize?: number;
  batchConcurrency?: number;
}

export function useUpdateTriageBatchSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTriageBatchSettingsInput) =>
      apiFetch<TriageBatchSettings>({
        path: "/settings/triage-batch",
        method: "PUT",
        body: input,
      }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.triageBatchSettings, data);
    },
  });
}

export interface RemoveAccountInput {
  accountId: string;
}

/**
 * Disconnect an account and forget its synced data.
 *
 * The removal reaches well past the accounts list — messages, labels, filters
 * and logs are all account-scoped — so this invalidates each of those key
 * prefixes rather than only `accounts`, otherwise the message list keeps
 * rendering mail belonging to a mailbox that no longer exists.
 */
export function useRemoveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RemoveAccountInput) =>
      apiFetch<{ account: { id: string; email: string } }>({
        path: `/accounts/${input.accountId}`,
        method: "DELETE",
      }),
    onSuccess: async () => {
      // `accounts` is also the prefix for per-account labels.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.accounts }),
        qc.invalidateQueries({ queryKey: ["messages"] }),
        qc.invalidateQueries({ queryKey: ["filters"] }),
        qc.invalidateQueries({ queryKey: ["logs"] }),
      ]);
    },
  });
}
