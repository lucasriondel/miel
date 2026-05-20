import { useAccounts } from "../api/queries";
import { Spinner } from "./Spinner";

interface Props {
  value: string | undefined;
  onChange: (accountId: string) => void;
}

export const AccountPicker = ({ value, onChange }: Props) => {
  const { data, isLoading, error } = useAccounts();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-miel-muted">
        <Spinner size={12} /> Loading accounts…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-xs text-miel-high">Failed to load accounts.</p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-miel-muted">
        No accounts yet. Run <code>miel accounts sync</code> or click Sync.
      </p>
    );
  }

  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-miel-muted">
        Account
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-miel-line bg-miel-panel px-2 py-1.5 text-sm"
      >
        <option value="" disabled>
          Select an account
        </option>
        {data.map((a) => (
          <option key={a.id} value={a.id}>
            {a.email}
          </option>
        ))}
      </select>
    </label>
  );
};
