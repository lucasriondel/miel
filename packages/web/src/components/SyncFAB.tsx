import { useSyncStream } from "../api/syncSocket";

interface Props {
  accountEmail?: string;
}

export const SyncFAB = ({ accountEmail }: Props) => {
  const { start, isRunning } = useSyncStream();

  const handleSync = () => {
    start({ account: accountEmail, since: "7d" });
  };

  return (
    <button
      onClick={handleSync}
      disabled={isRunning}
      className="fixed bottom-8 right-8 flex h-16 w-16 items-center justify-center rounded-full bg-gousse-accent text-white shadow-gousse-xl transition-all active:scale-[0.96] hover:scale-105 hover:shadow-gousse-xl disabled:opacity-60 disabled:hover:scale-100"
      aria-label="Sync messages"
      title="Sync messages"
    >
      {isRunning ? <span className="animate-spin text-xl font-medium">⟳</span> : <ReloadIcon />}
    </button>
  );
};

const ReloadIcon = () => (
  <svg
    width="20"
    height="20"
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
