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
 * The segmented control the redesign uses for every small fixed choice (theme,
 * remote images, run interval): a fill-coloured track with an 8px corner, the
 * chosen option lifted onto a white chip with the small shadow. Same shape as
 * the inbox's Week / Month / Year switch.
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
      className="inline-flex gap-0.5 rounded-lg bg-gousse-fill p-0.5"
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
            className={`h-[26px] rounded-md px-3 text-xs transition-[background-color,color,box-shadow] disabled:opacity-60 ${
              on
                ? "bg-gousse-panel font-semibold text-gousse-ink shadow-gousse-sm"
                : "font-medium text-gousse-muted hover:text-gousse-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
