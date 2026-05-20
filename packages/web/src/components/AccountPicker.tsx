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
    <fieldset className="block">
      <legend className="block text-xs font-medium uppercase tracking-wide text-miel-muted">
        Account
      </legend>
      <div role="radiogroup" className="mt-1 flex flex-col gap-1">
        {data.map((a) => (
          <AccountOption
            key={a.id}
            email={a.email}
            checked={value === a.id}
            onSelect={() => onChange(a.id)}
          />
        ))}
      </div>
    </fieldset>
  );
};

interface AccountOptionProps {
  email: string;
  checked: boolean;
  onSelect: () => void;
}

const AccountOption = ({ email, checked, onSelect }: AccountOptionProps) => {
  return (
    <label
      className={`flex cursor-pointer items-center rounded px-2 py-1.5 text-sm transition-colors ${
        checked
          ? "bg-miel-accent/15 text-miel-ink"
          : "text-miel-muted hover:bg-miel-line/40 hover:text-miel-ink"
      }`}
    >
      <input
        type="radio"
        name="account-picker"
        value={email}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="truncate">{email}</span>
    </label>
  );
};
