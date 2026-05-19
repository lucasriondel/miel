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
