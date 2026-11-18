import { useId } from "react";

interface Props {
  label: string;
  /** What the number controls, as the field's description for assistive tech. */
  hint: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
  onCommit: (n: number) => void;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * A labelled number field with its allowed range drawn inside the box, right
 * of the value ("15 … 1 – 50"). Commits on blur and on Enter, clamped to the
 * range, so a typed 80 saves as 50 rather than as a 400.
 */
export const BatchNumberField = ({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
  onCommit,
}: Props) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-gousse-ink">
        {label}
      </label>
      <div className="flex h-8 items-center rounded-lg border border-gousse-line bg-gousse-panel px-3 focus-within:border-gousse-primary focus-within:ring-[3px] focus-within:ring-gousse-primary/15">
        <input
          id={id}
          type="number"
          title={hint}
          min={min}
          max={max}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={() => onCommit(clamp(value, min, max))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit(clamp(value, min, max));
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-xs font-medium text-gousse-ink tabular-nums outline-none disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span aria-hidden className="text-[11px] text-gousse-subtle tabular-nums">
          {min} – {max}
        </span>
      </div>
    </div>
  );
};
