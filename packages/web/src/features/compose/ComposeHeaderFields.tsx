import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { invalidAddresses } from "./recipients";

interface Props {
  to: string;
  cc: string;
  subject: string;
  onToChange: (next: string) => void;
  onCcChange: (next: string) => void;
  onSubjectChange: (next: string) => void;
  disabled: boolean;
}

/**
 * The header block of a compose window: who it goes to and what it is about,
 * above the body (#96). Recipients are editable even for a reply, where they
 * used to be implicit in the thread and invisible.
 *
 * One text field per list rather than a chip editor: the parse lives in
 * `recipients.ts` and the field is never rewritten under the caret, which is
 * the behaviour a half-typed address needs.
 */
export const ComposeHeaderFields = ({
  to,
  cc,
  subject,
  onToChange,
  onCcChange,
  onSubjectChange,
  disabled,
}: Props) => (
  <div className="flex flex-col gap-2">
    <AddressField label="To" value={to} onChange={onToChange} disabled={disabled} />
    <AddressField label="Cc" value={cc} onChange={onCcChange} disabled={disabled} />
    <HeaderRow label="Subject">
      <Input
        type="text"
        value={subject}
        onChange={(e) => onSubjectChange(e.target.value)}
        disabled={disabled}
        className="flex-1"
      />
    </HeaderRow>
  </div>
);

const AddressField = ({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) => {
  const rejected = invalidAddresses(value);
  return (
    <div className="flex flex-col gap-1">
      <HeaderRow label={label}>
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          // The browser's contact autofill is welcome here, unlike in the
          // credential fields, but the spell-checker has nothing to say.
          spellCheck={false}
          placeholder="name@example.com, second@example.com"
          className="flex-1"
        />
      </HeaderRow>
      {rejected.length > 0 ? (
        <p className="pl-14 text-xs text-gousse-high">Not an address: {rejected.join(", ")}</p>
      ) : null}
    </div>
  );
};

const HeaderRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex items-center gap-2">
    <span className="w-12 shrink-0 text-xs text-gousse-muted">{label}</span>
    {children}
  </label>
);
