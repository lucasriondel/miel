import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type { WorpSettings, WorpSettingsPatch } from "./types";

// Pure option factories for the worp settings hooks, extracted so the request
// shapes and the cache writes can be unit-tested without a DOM render (mirrors
// providerCredential.hooks.ts).
//
// One query and one mutation, because the server treats worp's three parts as
// one setting: the response to a patch is the whole current state, so a save
// that touches only the base URL still refreshes the key's masked hint.
//
// The API key travels one way. It goes out in a PUT body and is never put in
// the cache — what comes back, and all this holds, is presence plus a hint.

export function worpSettingsQueryOptions() {
  return {
    queryKey: queryKeys.worpSettings,
    queryFn: async () => apiFetch<WorpSettings>({ path: "/settings/worp" }),
  };
}

export function updateWorpSettingsMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (patch: WorpSettingsPatch) =>
      apiFetch<WorpSettings>({
        path: "/settings/worp",
        method: "PUT" as const,
        body: patch,
      }),
    onSuccess: (data: WorpSettings) => {
      qc.setQueryData(queryKeys.worpSettings, data);
    },
  };
}

export function useWorpSettings() {
  return useQuery(worpSettingsQueryOptions());
}

export function useUpdateWorpSettings() {
  const qc = useQueryClient();
  return useMutation(updateWorpSettingsMutationOptions(qc));
}
