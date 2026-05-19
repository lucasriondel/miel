import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type { Account, Label, ModelSettings, SyncResponse } from "./types";

export function useSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { account?: string; since?: string }) =>
      apiFetch<SyncResponse>({
        path: "/sync",
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts });
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

export interface MessageActionResult {
  ok: true;
  threadId: string;
}

export interface MessageActionInput {
  accountId: string;
  gmailMessageId: string;
}

export function useArchiveMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MessageActionInput) =>
      apiFetch<MessageActionResult>({
        path: `/messages/${input.accountId}/${input.gmailMessageId}/archive`,
        method: "POST",
      }),
    onSuccess: (_data, input) => {
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
    onSuccess: (_data, input) => {
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
