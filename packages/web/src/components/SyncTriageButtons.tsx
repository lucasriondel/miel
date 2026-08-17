import { useSyncStream } from "../api/syncSocket";

interface Props {
  accountEmail?: string;
}

export const SyncTriageButtons = ({ accountEmail }: Props) => {
  const { start, isRunning } = useSyncStream();

  const handleSync = () => {
    start({ account: accountEmail, since: "7d" });
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleSync}
        disabled={isRunning}
        className="group relative inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gousse-accent to-gousse-accent/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-gousse-accent/30 transition-all active:scale-[0.96] hover:shadow-xl hover:shadow-gousse-accent/40 disabled:opacity-50 disabled:shadow-md disabled:hover:scale-100"
        aria-label="Sync messages"
        title="Sync messages"
      >
        <div className="absolute inset-0 rounded-lg bg-white/0 transition-all group-hover:bg-white/10" />
        <div className="relative flex items-center gap-2">
          {isRunning ? <span className="animate-spin text-base">⟳</span> : <ReloadIcon />}
          <span>Sync</span>
        </div>
      </button>
    </div>
  );
};

const ReloadIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </svg>
);
