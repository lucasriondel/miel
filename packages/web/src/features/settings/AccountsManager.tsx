import { format, formatDistanceToNow } from "date-fns";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { EmptyState } from "../../components/EmptyState";
import { useAccounts } from "../../api/queries";
import { useSyncAccounts } from "../../api/mutations";
import { ApiError } from "../../api/client";

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const AccountsManager = () => {
  const accounts = useAccounts();
  const syncAccounts = useSyncAccounts();

  return (
    <div className="rounded border border-miel-line bg-miel-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-miel-ink">Accounts</h3>
          <p className="text-xs text-miel-muted">
            Re-import the list of authorized Gmail accounts from <code>gog</code>.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={syncAccounts.isPending}
          onClick={() => syncAccounts.mutate()}
        >
          {syncAccounts.isPending ? <Spinner size={12} /> : null}
          {syncAccounts.isPending ? "Importing…" : "Import from gog"}
        </Button>
      </div>

      {syncAccounts.isError ? (
        <p className="mt-3 text-xs text-miel-high">
          Failed to import accounts: {describeError(syncAccounts.error)}
        </p>
      ) : null}

      <div className="mt-4">
        {accounts.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-miel-muted">
            <Spinner /> Loading accounts…
          </div>
        ) : accounts.error ? (
          <p className="text-sm text-miel-high">
            Failed to load accounts: {describeError(accounts.error)}
          </p>
        ) : !accounts.data || accounts.data.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            description="Run `gog auth add` in a terminal, then click Import to bring them in."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-miel-line">
            {accounts.data.map((acc) => (
              <li
                key={acc.id}
                className="flex flex-col gap-1 py-2 text-sm first:pt-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-miel-ink">{acc.email}</span>
                  {acc.displayName ? (
                    <span className="text-xs text-miel-muted">
                      {acc.displayName}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-miel-muted">
                  {acc.lastSyncedAt ? (
                    <>
                      Last synced{" "}
                      {formatDistanceToNow(new Date(acc.lastSyncedAt), {
                        addSuffix: true,
                      })}{" "}
                      ({format(new Date(acc.lastSyncedAt), "PPpp")})
                    </>
                  ) : (
                    "Never synced"
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
