import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { useAccounts } from "../../api/queries";
import { useSync } from "../../api/mutations";
import { ApiError } from "../../api/client";
import type { SyncRunResult } from "../../api/types";

const SINCE_OPTIONS = [
  { value: "1d", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const SettingsSyncTrigger = () => {
  const accounts = useAccounts();
  const sync = useSync();
  const [accountEmail, setAccountEmail] = useState<string>("");
  const [since, setSince] = useState<string>("7d");
  const [runs, setRuns] = useState<SyncRunResult[] | null>(null);

  useEffect(() => {
    if (accountEmail === "" && accounts.data && accounts.data.length > 0) {
      // leave blank to default to "all accounts"
    }
  }, [accounts.data, accountEmail]);

  return (
    <div className="rounded border border-miel-line bg-miel-panel p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-miel-ink">Run sync</h3>
        <p className="text-xs text-miel-muted">
          Fetch new messages from Gmail and run Claude triage on them.
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-xs font-medium text-miel-muted">Account</label>
        <select
          value={accountEmail}
          onChange={(e) => setAccountEmail(e.target.value)}
          className="rounded border border-miel-line bg-miel-panel px-2 py-1.5 text-sm"
        >
          <option value="">All accounts</option>
          {accounts.data?.map((a) => (
            <option key={a.id} value={a.email}>
              {a.email}
            </option>
          ))}
        </select>
        <label className="text-xs font-medium text-miel-muted">Window</label>
        <select
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="rounded border border-miel-line bg-miel-panel px-2 py-1.5 text-sm"
        >
          {SINCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          disabled={sync.isPending}
          onClick={() => {
            setRuns(null);
            sync.mutate(
              {
                account: accountEmail || undefined,
                since,
              },
              {
                onSuccess: (data) => setRuns(data.runs),
              },
            );
          }}
        >
          {sync.isPending ? <Spinner size={12} /> : null}
          {sync.isPending ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      {sync.isError ? (
        <p className="mt-2 text-xs text-miel-high">
          Sync failed: {describeError(sync.error)}
        </p>
      ) : null}

      {runs && runs.length > 0 ? (
        <div className="mt-4 rounded border border-miel-line bg-miel-bg p-3">
          <h4 className="text-xs font-medium text-miel-ink">Last run</h4>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-miel-muted">
            {runs.map((r) => (
              <li key={r.account}>
                <span className="font-medium text-miel-ink">{r.account}</span>:{" "}
                fetched {r.fetched}, triaged {r.triaged}, suggested{" "}
                {r.suggestedNewLabels}
                {r.errors.length > 0
                  ? `, errors: ${r.errors.length}`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
