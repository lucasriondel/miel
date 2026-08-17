interface Option<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  options: readonly Option<T>[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}

/**
 * A pill segmented control matching the app's floating-island language: a
 * `bg-line/35` track holding options; the active one lifts onto a panel chip.
 * Used for the theme picker and the automatic-sync interval where a small,
 * fixed set of choices reads better than a dropdown.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex gap-1 rounded-full bg-gousse-line/35 p-1"
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            // `<input type="radio">` is what the rule wants, and it cannot carry
            // this label or these surfaces without a hidden input plus a styled
            // proxy. A button in a `radiogroup` is the ARIA pattern for exactly
            // that trade.
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- see above
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-[background-color,color,box-shadow] active:scale-[0.96] disabled:opacity-60 ${
              on
                ? "bg-gousse-panel text-gousse-ink shadow-gousse-sm"
                : "text-gousse-muted hover:text-gousse-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
