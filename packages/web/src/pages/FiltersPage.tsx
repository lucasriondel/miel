import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { useAccounts, useFilters, queryKeys } from "../api/queries";
import { apiFetch, ApiError } from "../api/client";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { AccountFiltersSection } from "../features/filters/AccountFiltersSection";
import type { Label } from "../api/types";

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const FiltersPage = () => {
  const accounts = useAccounts();
  const filters = useFilters(undefined);
  const labelQueries = useQueries({
    queries: (accounts.data ?? []).map((a) => ({
      queryKey: queryKeys.labels(a.id),
      queryFn: async () => {
        const res = await apiFetch<{ labels: Label[] }>({
          path: `/accounts/${a.id}/labels`,
        });
        return res.labels;
      },
    })),
  });

  if (accounts.isLoading || filters.isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 pt-4 text-sm text-miel-muted">
        <Spinner /> Loading filters…
      </div>
    );
  }
  if (accounts.error || filters.error) {
    return (
      <div className="px-6 pt-4">
        <EmptyState
          title="Failed to load filters"
          description={describeError(accounts.error ?? filters.error)}
        />
      </div>
    );
  }

  const accountList = accounts.data ?? [];
  const filterList = filters.data?.filters ?? [];
  const suggestionList = filters.data?.suggestions ?? [];

  const filtersByAccount = new Map<string, typeof filterList>();
  for (const f of filterList) {
    const arr = filtersByAccount.get(f.accountId) ?? [];
    arr.push(f);
    filtersByAccount.set(f.accountId, arr);
  }
  const suggestionsByAccount = new Map<string, typeof suggestionList>();
  for (const s of suggestionList) {
    const arr = suggestionsByAccount.get(s.accountId) ?? [];
    arr.push(s);
    suggestionsByAccount.set(s.accountId, arr);
  }
  const labelsByAccount = new Map<string, Label[]>();
  accountList.forEach((a, i) => {
    labelsByAccount.set(a.id, labelQueries[i]?.data ?? []);
  });

  const totalFilters = filterList.length;
  const totalSuggestions = suggestionList.length;

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
      <div className="flex flex-col gap-1">
        <Link to="/" className="text-sm text-miel-muted underline">
          ← Back to inbox
        </Link>
        <h1 className="text-lg font-semibold">Filters</h1>
        <p className="text-sm text-miel-muted">
          Gmail filters synced from each account. Claude proposes new filters
          based on patterns it sees during sync — review and create them in one
          click.
        </p>
        <p className="text-xs text-miel-muted">
          {totalFilters} filter{totalFilters === 1 ? "" : "s"} across{" "}
          {accountList.length} account{accountList.length === 1 ? "" : "s"}
          {totalSuggestions > 0 ? ` · ${totalSuggestions} proposed` : ""}
        </p>
      </div>

      {accountList.length === 0 ? (
        <EmptyState
          title="No accounts synced"
          description="Add an account in Settings and run sync to see filters here."
        />
      ) : (
        accountList.map((a) => (
          <AccountFiltersSection
            key={a.id}
            account={a}
            filters={filtersByAccount.get(a.id) ?? []}
            suggestions={suggestionsByAccount.get(a.id) ?? []}
            labels={labelsByAccount.get(a.id) ?? []}
          />
        ))
      )}
    </div>
  );
};
