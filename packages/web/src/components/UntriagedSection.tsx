import { Sparkles } from "lucide-react";
import type { ListedMessage } from "../api/types";
import { useSyncStream } from "../api/syncSocket";
import { Spinner } from "./Spinner";

interface Props {
  messages: ListedMessage[];
  accountEmail: string | undefined;
}

export const UntriagedSection = ({ messages, accountEmail }: Props) => {
  const { startTriage, isRunning } = useSyncStream();

  if (messages.length === 0) return null;

  const onTriage = () => {
    if (!accountEmail || isRunning) return;
    startTriage({ account: accountEmail });
  };

  return (
    <section className="group/section flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <span className="inline-flex rounded bg-miel-line px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-miel-muted">
          untriaged
        </span>
        <h2 className="text-sm font-semibold text-miel-ink">Not yet triaged</h2>
        <span className="text-xs text-miel-muted">({messages.length})</span>
        {isRunning ? <Spinner size={12} /> : null}
        <div className="ml-auto">
          <TriageAllButton
            onClick={onTriage}
            disabled={!accountEmail || isRunning}
          />
        </div>
      </header>
      <div className="flex flex-col gap-2">
        {messages.map((m) => (
          <div
            key={`${m.accountId}:${m.gmailMessageId}`}
            className="rounded-md border border-dashed border-miel-line bg-miel-panel px-3 py-2 text-sm text-miel-muted"
          >
            {m.fromName ?? m.fromEmail} — {m.subject ?? "(no subject)"}
          </div>
        ))}
      </div>
    </section>
  );
};

interface TriageAllButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const TriageAllButton = ({ onClick, disabled }: TriageAllButtonProps) => {
  return (
    <button
      type="button"
      aria-label="Triage all untriaged"
      title="Triage all untriaged"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-miel-muted opacity-0 transition-opacity duration-150 hover:bg-miel-line hover:text-miel-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent group-hover/section:opacity-100"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
};
