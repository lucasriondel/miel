import { useState } from "react";
import { ApiError } from "../../api/client";
import { useSync, type SyncInput } from "../../api/mutations";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";

function isReauthError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    typeof err.body === "object" &&
    err.body !== null &&
    (err.body as { error?: unknown }).error === "reauth_required"
  );
}

type Preset = "1d" | "7d" | "30d";

interface Props {
  accountEmail?: string;
  onResult?: (info: { fetched: number; triaged: number; errors: string[] }) => void;
  onError?: (message: string) => void;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
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

export const SyncRangeControls = ({ accountEmail, onResult, onError }: Props) => {
  const sync = useSync();
  const [preset, setPreset] = useState<Preset>("7d");
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const runSync = (input: SyncInput) => {
    sync.mutate(
      { account: accountEmail, ...input },
      {
        onSuccess: (data) => {
          const totals = data.runs.reduce(
            (acc, r) => {
              acc.fetched += r.fetched;
              acc.triaged += r.triaged;
              acc.errors.push(...r.errors);
              return acc;
            },
            { fetched: 0, triaged: 0, errors: [] as string[] },
          );
          onResult?.(totals);
        },
        onError: (err) => {
          if (isReauthError(err)) return;
          onError?.(describeError(err));
        },
      },
    );
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
      <div className="flex items-center gap-1 rounded-md border border-miel-line bg-miel-panel p-0.5">
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
                ? "bg-miel-ink text-miel-bg"
                : "text-miel-muted hover:bg-miel-line/60"
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
              ? "bg-miel-ink text-miel-bg"
              : "text-miel-muted hover:bg-miel-line/60"
          }`}
        >
          Custom…
        </button>
      </div>

      <Button
        variant="primary"
        disabled={sync.isPending || (customOpen && (!customFrom || !customTo))}
        onClick={customOpen ? onCustomSync : onPresetSync}
      >
        {sync.isPending ? <Spinner size={12} /> : <ReloadIcon />}
        {sync.isPending ? "Syncing…" : "Sync"}
      </Button>

      {customOpen ? (
        <div className="absolute right-0 top-10 z-10 flex items-center gap-2 rounded-md border border-miel-line bg-miel-panel p-3 shadow-md">
          <label className="flex flex-col text-xs text-miel-muted">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded border border-miel-line px-2 py-1 text-sm text-miel-ink"
            />
          </label>
          <label className="flex flex-col text-xs text-miel-muted">
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded border border-miel-line px-2 py-1 text-sm text-miel-ink"
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
