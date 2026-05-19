import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type { SyncResponse } from "./types";

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
