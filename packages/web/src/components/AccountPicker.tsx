import { useAccounts } from "../api/queries";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  value: string | undefined;
  onChange: (accountId: string) => void;
}

/**
 * Radio list of the connected accounts. Loading and failure get their own
 * states; an *empty* list gets none — the onboarding gate blocks the app until
 * an account is connected, so this can only ever render a non-empty list.
 */
export const AccountPicker = ({ value, onChange }: Props) => {
  const { data, isLoading, error } = useAccounts();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gousse-muted">
        <Spinner size={12} /> Loading accounts…
      </div>
    );
  }
  if (error) {
    return <p className="text-xs text-gousse-high">Failed to load accounts.</p>;
  }
  return (
    <fieldset className="block">
      <legend className="block text-xs font-medium uppercase tracking-wide text-gousse-muted">
        Account
      </legend>
      <RadioGroup className="mt-1">
        {data?.map((a) => (
          <RadioGroupItem
            key={a.id}
            name="account-picker"
            value={a.id}
            checked={value === a.id}
            onSelect={() => onChange(a.id)}
          >
            <span className="truncate">{a.email}</span>
          </RadioGroupItem>
        ))}
      </RadioGroup>
    </fieldset>
  );
};
