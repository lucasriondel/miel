import { useState } from "react";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { useAccounts } from "../../api/queries";
import { useSyncStream } from "../../api/syncSocket";

const SINCE_OPTIONS = [
  { value: "1d", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

export const SettingsSyncTrigger = () => {
  const accounts = useAccounts();
  const { start, isRunning } = useSyncStream();
  const [accountEmail, setAccountEmail] = useState<string>("");
  const [since, setSince] = useState<string>("7d");

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
          disabled={isRunning}
          onClick={() => {
            start({
              account: accountEmail || undefined,
              since,
            });
          }}
        >
          {isRunning ? <Spinner size={12} /> : null}
          {isRunning ? "Syncing…" : "Sync now"}
        </Button>
      </div>
    </div>
  );
};
