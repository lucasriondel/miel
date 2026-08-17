import { useState } from "react";
import { useSyncStream, type SyncStreamInput } from "../../api/syncSocket";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Preset = "1d" | "7d" | "30d";

interface Props {
  accountEmail?: string;
}

function toIsoFromInput(date: string, endOfDay: boolean): string {
  // <input type="date"> → YYYY-MM-DD in local time. Anchor to midnight (start)
  // or 23:59:59.999 (end) so the range covers the whole day in the user's TZ.
  const [y, m, d] = date.split("-").map(Number);
  const local = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
  return local.toISOString();
}

export const SyncRangeControls = ({ accountEmail }: Props) => {
  const { start, isRunning } = useSyncStream();
  const [preset, setPreset] = useState<Preset>("7d");
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const runSync = (input: SyncStreamInput) => {
    start({ account: accountEmail, ...input });
  };

  const onPresetSync = () => {
    setCustomOpen(false);
    runSync({ since: preset });
  };

  const onCustomSync = () => {
    if (!customFrom || !customTo) return;
    runSync({
      range: {
        from: toIsoFromInput(customFrom, false),
        to: toIsoFromInput(customTo, true),
      },
    });
  };

  const presets: Preset[] = ["1d", "7d", "30d"];

  return (
    <div className="relative flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-md border border-gousse-line bg-gousse-panel p-0.5">
        {presets.map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => {
              setPreset(p);
              setCustomOpen(false);
            }}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              preset === p && !customOpen
                ? "bg-gousse-ink text-gousse-bg"
                : "text-gousse-muted hover:bg-gousse-line/60"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            customOpen
              ? "bg-gousse-ink text-gousse-bg"
              : "text-gousse-muted hover:bg-gousse-line/60"
          }`}
        >
          Custom…
        </button>
      </div>

      <Button
        variant="primary"
        disabled={isRunning || (customOpen && (!customFrom || !customTo))}
        onClick={customOpen ? onCustomSync : onPresetSync}
      >
        {isRunning ? <Spinner size={12} /> : <ReloadIcon />}
        {isRunning ? "Syncing…" : "Sync"}
      </Button>

      {customOpen ? (
        <div className="absolute right-0 top-10 z-10 flex items-center gap-2 rounded-md border border-gousse-line bg-gousse-panel p-3 shadow-md">
          <label className="flex flex-col text-xs text-gousse-muted">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded border border-gousse-line px-2 py-1 text-sm text-gousse-ink"
            />
          </label>
          <label className="flex flex-col text-xs text-gousse-muted">
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded border border-gousse-line px-2 py-1 text-sm text-gousse-ink"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
};

const ReloadIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </svg>
);
