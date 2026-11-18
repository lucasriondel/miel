import { useLayoutEffect, useRef, useState } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

interface Thumb {
  left: number;
  width: number;
}

/**
 * Segmented control (UI System › Segmented Control): a `--gousse-fill` track
 * with a 2px inset and a white 6px-cornered thumb sliding behind the active
 * option.
 * The thumb position is measured from the live button geometry so it stays
 * correct across font/label changes.
 */
export const SegmentedToggle = <T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: Props<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [thumb, setThumb] = useState<Thumb | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const active = btnRefs.current.get(value);
    if (!container || !active) return;
    setThumb({ left: active.offsetLeft, width: active.offsetWidth });
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className="relative inline-flex h-7 items-center rounded-lg bg-gousse-fill p-0.5"
    >
      {thumb && (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0 z-0 rounded-md bg-gousse-panel shadow-gousse-sm transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
        />
      )}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) btnRefs.current.set(opt.value, el);
              else btnRefs.current.delete(opt.value);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-[1] h-6 rounded-md px-2.5 text-xs transition-colors duration-150 ${
              active
                ? "font-semibold text-gousse-ink"
                : "font-medium text-gousse-muted hover:text-gousse-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
