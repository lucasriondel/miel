import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type {
  Account,
  Label,
  ListMessagesResponse,
  ListedMessage,
  ModelSettings,
  StartClaudeLoginResult,
} from "./types";

export interface MessageActionResult {
  ok: true;
  threadId: string;
}

export interface MessageActionInput {
  accountId: string;
  gmailMessageId: string;
}

type MessagesSnapshot = Array<
  [readonly unknown[], ListMessagesResponse | undefined]
>;

function snapshotMessageLists(
  qc: ReturnType<typeof useQueryClient>,
): MessagesSnapshot {
  return qc.getQueriesData<ListMessagesResponse>({ queryKey: ["messages"] });
}

function matches(m: ListedMessage, input: MessageActionInput): boolean {
  return (
    m.accountId === input.accountId &&
    m.gmailMessageId === input.gmailMessageId
  );
}

function removeFromMessageLists(
  qc: ReturnType<typeof useQueryClient>,
  input: MessageActionInput,
) {
  qc.setQueriesData<ListMessagesResponse>(
    { queryKey: ["messages"] },
    (data) => {
      if (!data) return data;
      return {
        ...data,
        items: data.items.filter((m) => !matches(m, input)),
      };
    },
  );
}

function restoreMessageLists(
  qc: ReturnType<typeof useQueryClient>,
  snapshot: MessagesSnapshot,
) {
  for (const [key, data] of snapshot) {
    qc.setQueryData(key, data);
  }
}

export function useArchiveMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MessageActionInput) =>
      apiFetch<MessageActionResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/archive`,
        method: "POST",
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["messages"] });
      const snapshot = snapshotMessageLists(qc);
      removeFromMessageLists(qc, input);
      return { snapshot };
    },
    onError: (_err, _input, context) => {
      if (context?.snapshot) restoreMessageLists(qc, context.snapshot);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({
        queryKey: queryKeys.message(input.accountId, input.gmailMessageId),
      });
    },
  });
}

export function useTrashMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MessageActionInput) =>
      apiFetch<MessageActionResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}`,
        method: "DELETE",
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["messages"] });
      const snapshot = snapshotMessageLists(qc);
      removeFromMessageLists(qc, input);
      return { snapshot };
    },
    onError: (_err, _input, context) => {
      if (context?.snapshot) restoreMessageLists(qc, context.snapshot);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({
        queryKey: queryKeys.message(input.accountId, input.gmailMessageId),
      });
    },
  });
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

export function useSetMessageRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetMessageReadInput) =>
      apiFetch<SetMessageReadResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/read`,
        method: "POST",
        body: { read: input.read },
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["messages"] });
      const snapshot = snapshotMessageLists(qc);
      qc.setQueriesData<ListMessagesResponse>(
        { queryKey: ["messages"] },
        (data) => {
          if (!data) return data;
          return {
            ...data,
            items: data.items.map((m) => {
              if (!matches(m, input)) return m;
              const hasUnread = m.labels.some((l) => l.name === "UNREAD");
              if (input.read && hasUnread) {
                return {
                  ...m,
                  labels: m.labels.filter((l) => l.name !== "UNREAD"),
                };
              }
              if (!input.read && !hasUnread) {
                return { ...m, labels: [UNREAD_LABEL, ...m.labels] };
              }
              return m;
            }),
          };
        },
      );
      return { snapshot };
    },
    onError: (_err, _input, context) => {
      if (context?.snapshot) restoreMessageLists(qc, context.snapshot);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({
        queryKey: queryKeys.message(input.accountId, input.gmailMessageId),
      });
    },
  });
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

export function useGenerateReply() {
  return useMutation({
    mutationFn: async (input: GenerateReplyInput) =>
      apiFetch<GenerateReplyResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/generate-reply`,
        method: "POST",
        body: { prompt: input.prompt },
      }),
  });
}

export interface SendReplyInput extends MessageActionInput {
  subject: string;
  body: string;
}

export interface SendReplyResult {
  ok: true;
  sentMessageId: string;
}

export function useSendReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendReplyInput) =>
      apiFetch<SendReplyResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/send-reply`,
        method: "POST",
        body: { subject: input.subject, body: input.body },
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({
        queryKey: queryKeys.message(input.accountId, input.gmailMessageId),
      });
    },
  });
}

export interface UpdateSettingsInput {
  triageModel?: string;
  replyModel?: string;
  filterModel?: string;
}

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

export function useSyncAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<{ accounts: Account[] }>({
        path: "/accounts/sync",
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });
}

export interface SyncLabelsInput {
  accountId: string;
}

export function useSyncAccountLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SyncLabelsInput) =>
      apiFetch<{ labels: Label[] }>({
        path: `/accounts/${input.accountId}/labels/sync`,
        method: "POST",
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.labels(input.accountId) });
    },
  });
}

export type BatchMessageAction = "read" | "archive" | "trash";

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

export function useBatchMessageAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BatchMessageActionInput) =>
      apiFetch<BatchMessageActionResult>({
        path: "/messages/batch",
        method: "POST",
        body: {
          accountId: input.accountId,
          gmailMessageIds: input.gmailMessageIds,
          action: input.action,
        },
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["messages"] });
      const snapshot = snapshotMessageLists(qc);
      const ids = new Set(input.gmailMessageIds);
      qc.setQueriesData<ListMessagesResponse>(
        { queryKey: ["messages"] },
        (data) => {
          if (!data) return data;
          if (input.action === "archive" || input.action === "trash") {
            return {
              ...data,
              items: data.items.filter(
                (m) =>
                  !(m.accountId === input.accountId && ids.has(m.gmailMessageId)),
              ),
            };
          }
          return {
            ...data,
            items: data.items.map((m) => {
              if (m.accountId !== input.accountId) return m;
              if (!ids.has(m.gmailMessageId)) return m;
              if (!m.labels.some((l) => l.name === "UNREAD")) return m;
              return {
                ...m,
                labels: m.labels.filter((l) => l.name !== "UNREAD"),
              };
            }),
          };
        },
      );
      return { snapshot };
    },
    onError: (_err, _input, context) => {
      if (context?.snapshot) restoreMessageLists(qc, context.snapshot);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      for (const id of input.gmailMessageIds) {
        qc.invalidateQueries({
          queryKey: queryKeys.message(input.accountId, id),
        });
      }
    },
  });
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

export function useApplyLabelSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyLabelSuggestionInput) =>
      apiFetch<ApplyLabelSuggestionResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/apply-suggestions`,
        method: "POST",
        body: {
          triageId: input.triageId,
          acceptExistingLabelIds:
            input.kind === "existing" ? [input.labelId] : undefined,
          acceptNewSuggestionIds:
            input.kind === "new" ? [input.suggestionId] : undefined,
        },
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["messages"] });
      const snapshot = snapshotMessageLists(qc);
      qc.setQueriesData<ListMessagesResponse>(
        { queryKey: ["messages"] },
        (data) => {
          if (!data) return data;
          return {
            ...data,
            items: data.items.map((m) => {
              if (!matches(m, input)) return m;
              if (input.kind === "existing") {
                const alreadyApplied = m.labels.some(
                  (l) => l.id === input.labelId,
                );
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
                    existing: m.pendingSuggestions.existing.filter(
                      (s) => s.labelId !== input.labelId,
                    ),
                  },
                };
              }
              return {
                ...m,
                pendingSuggestions: {
                  ...m.pendingSuggestions,
                  new: m.pendingSuggestions.new.filter(
                    (s) => s.suggestionId !== input.suggestionId,
                  ),
                },
              };
            }),
          };
        },
      );
      return { snapshot };
    },
    onError: (_err, _input, context) => {
      if (context?.snapshot) restoreMessageLists(qc, context.snapshot);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({
        queryKey: queryKeys.message(input.accountId, input.gmailMessageId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.labels(input.accountId) });
    },
  });
}

export interface RemoveMessageLabelInput extends MessageActionInput {
  labelId: string;
}

export interface RemoveMessageLabelResult {
  ok: true;
  added: { labelId: string; gmailLabelId: string; name: string }[];
  removed: { labelId: string; gmailLabelId: string; name: string }[];
}

export function useRemoveMessageLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RemoveMessageLabelInput) =>
      apiFetch<RemoveMessageLabelResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/labels`,
        method: "POST",
        body: { remove: [input.labelId] },
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["messages"] });
      const snapshot = snapshotMessageLists(qc);
      qc.setQueriesData<ListMessagesResponse>(
        { queryKey: ["messages"] },
        (data) => {
          if (!data) return data;
          return {
            ...data,
            items: data.items.map((m) => {
              if (!matches(m, input)) return m;
              return {
                ...m,
                labels: m.labels.filter((l) => l.id !== input.labelId),
              };
            }),
          };
        },
      );
      return { snapshot };
    },
    onError: (_err, _input, context) => {
      if (context?.snapshot) restoreMessageLists(qc, context.snapshot);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({
        queryKey: queryKeys.message(input.accountId, input.gmailMessageId),
      });
    },
  });
}

export interface CreateLabelInput {
  accountId: string;
  name: string;
}

export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLabelInput) =>
      apiFetch<{ label: Label }>({
        path: "/labels",
        method: "POST",
        body: input,
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.labels(input.accountId) });
    },
  });
}

export function useStartClaudeLogin() {
  return useMutation({
    mutationFn: async () =>
      apiFetch<StartClaudeLoginResult>({
        path: "/auth/claude/login",
        method: "POST",
      }),
  });
}

export interface SubmitClaudeLoginCodeInput {
  sessionId: string;
  code: string;
}

export function useSubmitClaudeLoginCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitClaudeLoginCodeInput) =>
      apiFetch<{ ok: true }>({
        path: "/auth/claude/login/code",
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.claudeAuth });
    },
  });
}
