import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type {
  Account,
  Label,
  ListMessagesResponse,
  MessageDetail,
  ModelSettings,
  Priority,
} from "./types";

export const queryKeys = {
  accounts: ["accounts"] as const,
  labels: (accountId: string | undefined) =>
    ["accounts", accountId ?? "_", "labels"] as const,
  messages: (params: ListMessagesParams) => ["messages", params] as const,
  message: (accountId: string, gmailMessageId: string) =>
    ["messages", accountId, gmailMessageId] as const,
  settings: ["settings"] as const,
};

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: async () => {
      const res = await apiFetch<{ accounts: Account[] }>({ path: "/accounts" });
      return res.accounts;
    },
  });
}

export function useLabels(accountId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.labels(accountId),
    enabled: Boolean(accountId),
    queryFn: async () => {
      const res = await apiFetch<{ labels: Label[] }>({
        path: `/accounts/${accountId}/labels`,
      });
      return res.labels;
    },
  });
}

export interface ListMessagesParams {
  accountId?: string;
  priority?: Priority;
  labelId?: string;
  limit?: number;
  cursor?: string;
}

export function useMessages(params: ListMessagesParams) {
  return useQuery({
    queryKey: queryKeys.messages(params),
    enabled: Boolean(params.accountId),
    queryFn: async () =>
      apiFetch<ListMessagesResponse>({
        path: "/messages",
        query: {
          account: params.accountId,
          priority: params.priority,
          label: params.labelId,
          limit: params.limit,
          cursor: params.cursor,
        },
      }),
  });
}

export function useMessage(
  accountId: string | undefined,
  gmailMessageId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.message(accountId ?? "_", gmailMessageId ?? "_"),
    enabled: Boolean(accountId && gmailMessageId),
    queryFn: async () =>
      apiFetch<MessageDetail>({
        path: `/messages/${accountId}/${gmailMessageId}`,
      }),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => apiFetch<ModelSettings>({ path: "/settings" }),
  });
}
