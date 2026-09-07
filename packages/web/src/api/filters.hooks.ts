import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { GmailFilter, MergeFiltersResult } from "./types";

// Pure option factory for the delete-filter mutation, extracted so the request
// shape and the cache invalidation can be unit-tested at the React Query seam
// without a DOM render (mirrors `schedule.hooks.ts`).

export interface DeleteFilterInput {
  accountId: string;
  gmailFilterId: string;
}

export function deleteFilterMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: DeleteFilterInput) =>
      apiFetch<{ filter: GmailFilter }>({
        // Gmail filter ids are opaque, so encode before splicing into the path.
        path: `/filters/${encodeURIComponent(input.gmailFilterId)}`,
        method: "DELETE" as const,
        query: { accountId: input.accountId },
      }),
    // Invalidate the whole `filters` prefix, not one account's key: the page
    // reads the list through it, so the row disappears without a manual refresh.
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["filters"] });
    },
  };
}

export function useDeleteFilter() {
  const qc = useQueryClient();
  return useMutation(deleteFilterMutationOptions(qc));
}

export interface MergeFiltersInput {
  accountId: string;
  /** The Gmail ids of the filters to fold into one. The server needs 2+. */
  gmailFilterIds: string[];
}

/**
 * Fold several of an account's filters into one.
 *
 * The endpoint creates the replacement before deleting any source, so a
 * rejection leaves the account exactly as it was — which is what lets the page
 * keep the user's selection and offer a retry rather than resyncing.
 */
export function mergeFiltersMutationOptions(qc: QueryClient) {
  return {
    mutationFn: async (input: MergeFiltersInput) =>
      apiFetch<MergeFiltersResult>({
        path: "/filters/merge",
        method: "POST" as const,
        body: input,
      }),
    // Same prefix as the delete: the sources vanish and the merged filter
    // appears in one refetch of the list the page reads.
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["filters"] });
    },
  };
}

export function useMergeFilters() {
  const qc = useQueryClient();
  return useMutation(mergeFiltersMutationOptions(qc));
}
