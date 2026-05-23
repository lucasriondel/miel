import type { ViewMode } from "./useWeek";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { value: ViewMode; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "all", label: "All" },
];

export const ViewModeToggle = ({ mode, onChange }: Props) => {
  return (
    <div
      role="tablist"
      aria-label="Inbox view"
      className="flex items-center gap-1 rounded-md border border-miel-line bg-miel-panel p-0.5"
    >
      {MODES.map((m) => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.value)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-miel-ink text-miel-bg"
                : "text-miel-muted hover:bg-miel-line/60"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
};
