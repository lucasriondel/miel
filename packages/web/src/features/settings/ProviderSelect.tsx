import { ProviderMark } from "@/components/ui/provider-mark";
import { Select } from "@/components/ui/select";
import { SETTINGS_SELECT } from "./settingsFields";

interface Option {
  id: string;
  label: string;
}

interface Props {
  ariaLabel: string;
  value: string;
  options: readonly Option[];
  disabled?: boolean;
  onChange: (next: string) => void;
  /** Draw the chosen provider's mark inside the field, before its name. */
  withMark?: boolean;
  className?: string;
}

/**
 * A native select in the settings chrome. The provider column draws the chosen
 * provider's mark in the field's left inset, as the design does — a native
 * `<option>` cannot carry an icon, so the mark sits over the closed field and
 * the open OS picker stays plain text.
 */
export const ProviderSelect = ({
  ariaLabel,
  value,
  options,
  disabled,
  onChange,
  withMark,
  className,
}: Props) => (
  <span className={`relative inline-flex ${className ?? ""}`}>
    {withMark ? (
      <ProviderMark
        provider={value}
        aria-hidden
        label=""
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 rounded-none bg-transparent dark:bg-transparent [&_svg]:size-3.5"
      />
    ) : null}
    <Select
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        if (e.target.value !== value) onChange(e.target.value);
      }}
      className={`w-full ${SETTINGS_SELECT} ${withMark ? "!pl-8" : ""}`}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </Select>
  </span>
);
