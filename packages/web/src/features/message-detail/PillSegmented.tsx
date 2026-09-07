import { cn } from "../../lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

/**
 * The pill segmented control: a `rounded-full` track holding `rounded-full`
 * thumbs, the active one filled `accent/15` with bold ink and the rest muted
 * (DESIGN.md §1 active convention, §3 shape).
 *
 * Shaped like the settings page's `Segmented` rather than the square track with
 * a hard accent fill the detail page used to carry. It differs from that one on
 * purpose: settings lifts its active thumb onto a panel chip, where §1's active
 * convention is a tinted fill, which is what the rest of the app reads as "on".
 */
export function PillSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
  className,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-1 rounded-full bg-gousse-line/30 p-1", className)}
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            // As in features/settings/Segmented.tsx: a styled `<input
            // type="radio">` would mean a hidden input and a proxy element, and
            // a button in a `radiogroup` is the ARIA pattern that replaces it.
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- see above
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs transition-[background-color,color,transform] active:scale-[0.96] disabled:opacity-60 ${
              on
                ? "bg-gousse-accent/15 font-bold text-gousse-ink"
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
