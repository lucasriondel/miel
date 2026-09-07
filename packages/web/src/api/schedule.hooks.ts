import type { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type { ScheduleSettings, ScheduleStatus } from "./types";

// Pure option factories for the schedule hooks. Extracted so the request shape
// and the cache-write can be unit-tested at the React Query seam without a DOM
// render (mirrors how other web logic is tested as plain functions).

export interface UpdateScheduleInput {
  enabled?: boolean;
  intervalMinutes?: number;
  since?: string;
}

export function scheduleQueryOptions() {
  return {
    queryKey: queryKeys.schedule,
    queryFn: async () => apiFetch<ScheduleSettings>({ path: "/settings/schedule" }),
  };
}

export function scheduleStatusQueryOptions() {
  return {
    queryKey: queryKeys.scheduleStatus,
    queryFn: async () => apiFetch<ScheduleStatus>({ path: "/settings/schedule/status" }),
    // The scheduler ticks every ~30s; poll so the "last run" display stays fresh
    // while the Settings page is open without a manual refresh.
    refetchInterval: 15_000,
  };
}

export function updateScheduleMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: UpdateScheduleInput) =>
      apiFetch<ScheduleSettings>({
        path: "/settings/schedule",
        method: "PUT" as const,
        body: input,
      }),
    onSuccess: (data: ScheduleSettings) => {
      qc.setQueryData(queryKeys.schedule, data);
    },
  };
}
