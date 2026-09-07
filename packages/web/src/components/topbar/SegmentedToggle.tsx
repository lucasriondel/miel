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
 * Pill segmented control with a sliding thumb behind the active option.
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
      className="relative inline-flex items-center gap-0.5 rounded-full"
    >
      {thumb && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 top-0 z-0 rounded-full bg-gousse-ink shadow-gousse-sm transition-[transform,width] duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]"
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
            className={`relative z-[1] rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition-colors duration-200 ${
              active ? "text-gousse-bg" : "text-gousse-muted hover:text-gousse-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
