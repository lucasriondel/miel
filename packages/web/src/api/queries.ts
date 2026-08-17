import { useEffect } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { scheduleQueryOptions, scheduleStatusQueryOptions } from "./schedule.hooks";
import type {
  Account,
  FiltersResponse,
  Label,
  ListMessagesResponse,
  LogsResponse,
  MessageDetail,
  ModelSettings,
  Priority,
  TriageBatchSettings,
} from "./types";

export const queryKeys = {
  accounts: ["accounts"] as const,
  labels: (accountId: string | undefined) => ["accounts", accountId ?? "_", "labels"] as const,
  messages: (params: ListMessagesParams) => ["messages", params] as const,
  message: (accountId: string, gmailMessageId: string) =>
    ["message", accountId, gmailMessageId] as const,
  settings: ["settings"] as const,
  triageBatchSettings: ["settings", "triage-batch"] as const,
  schedule: ["settings", "schedule"] as const,
  scheduleStatus: ["settings", "schedule", "status"] as const,
  filters: (accountId: string | undefined) => ["filters", accountId ?? "_all"] as const,
  googleOAuthConfig: ["auth", "google", "config"] as const,
  claudeCodeToken: ["settings", "claude-code-token"] as const,
  providerCredential: (provider: string) => ["settings", "provider-credentials", provider] as const,
  worpSettings: ["settings", "worp"] as const,
  logs: (limit?: number) => ["logs", limit ?? "default"] as const,
};

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: async () => {
      const res = await apiFetch<{ accounts: Account[] }>({ path: "/accounts" });
      const seen = new Set<string>();
      return res.accounts.filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
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
  internalDateFrom?: string;
  internalDateTo?: string;
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
          internalDateFrom: params.internalDateFrom,
          internalDateTo: params.internalDateTo,
        },
      }),
  });
}

// Inbox buckets by priority need the full result set (not just page 1), so
// this fetches every page up front instead of exposing manual "load more".
export function useAllMessages(params: Omit<ListMessagesParams, "cursor">) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.messages(params),
    enabled: Boolean(params.accountId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      apiFetch<ListMessagesResponse>({
        path: "/messages",
        query: {
          account: params.accountId,
          priority: params.priority,
          label: params.labelId,
          limit: params.limit ?? 200,
          cursor: pageParam,
          internalDateFrom: params.internalDateFrom,
          internalDateTo: params.internalDateTo,
        },
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return {
    items,
    isLoading: query.isLoading,
    // Still fetching later pages: treat as loading so buckets don't flash partial counts.
    isFetchingMore: query.isFetchingNextPage,
    error: query.error,
  };
}

export function useMessage(accountId: string | undefined, gmailMessageId: string | undefined) {
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

export function useTriageBatchSettings() {
  return useQuery({
    queryKey: queryKeys.triageBatchSettings,
    queryFn: async () => apiFetch<TriageBatchSettings>({ path: "/settings/triage-batch" }),
  });
}

export function useScheduleSettings() {
  return useQuery(scheduleQueryOptions());
}

export function useScheduleStatus() {
  return useQuery(scheduleStatusQueryOptions());
}

export function useFilters(accountId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.filters(accountId),
    queryFn: async () =>
      apiFetch<FiltersResponse>({
        path: "/filters",
        query: { accountId: accountId ?? undefined },
      }),
  });
}

export function useLogs(limit?: number) {
  return useQuery({
    queryKey: queryKeys.logs(limit),
    queryFn: async () =>
      apiFetch<LogsResponse>({
        path: "/logs",
        query: { limit },
      }),
  });
}
