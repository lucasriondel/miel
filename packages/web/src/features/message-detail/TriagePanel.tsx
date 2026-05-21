import { format } from "date-fns";
import { Sparkles } from "lucide-react";
import type { MessageDetail, Priority } from "../../api/types";

interface Props {
  message: MessageDetail;
}

const priorityChip: Record<Priority, string> = {
  high: "bg-miel-high text-white",
  medium: "bg-miel-medium text-white",
  low: "bg-miel-low text-white",
};

export const TriagePanel = ({ message }: Props) => {
  const latest = message.triageHistory[0];
  if (!latest) {
    return (
      <section className="rounded-lg border border-dashed border-miel-line bg-miel-panel/60 px-4 py-3 text-sm text-miel-muted">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" aria-hidden />
          <span>Not triaged yet — run a sync to generate a priority and label suggestions.</span>
        </div>
      </section>
    );
  }

  const older = message.triageHistory.slice(1);

  return (
    <section className="overflow-hidden rounded-lg border border-miel-line bg-miel-panel shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-miel-line bg-miel-bg/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-miel-muted" aria-hidden />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-miel-muted">
            Triage
          </h2>
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${priorityChip[latest.priority]}`}
          >
            {latest.priority}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-miel-muted">
          <time>{format(new Date(latest.createdAt), "PPpp")}</time>
          {latest.model ? <span>· {latest.model}</span> : null}
        </div>
      </header>
      <div className="px-4 py-3">
        <p className="text-sm leading-relaxed text-miel-ink">
          {latest.reasoning}
        </p>
      </div>
      {older.length > 0 ? (
        <details className="border-t border-miel-line bg-miel-bg/30">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-miel-muted hover:text-miel-ink">
            {older.length} earlier triage run{older.length === 1 ? "" : "s"}
          </summary>
          <ol className="flex flex-col gap-3 border-t border-miel-line px-4 py-3">
            {older.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-1 border-l-2 border-miel-line pl-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${priorityChip[t.priority]}`}
                  >
                    {t.priority}
                  </span>
                  <span className="text-xs text-miel-muted">
                    {format(new Date(t.createdAt), "PPpp")}
                  </span>
                  {t.model ? (
                    <span className="text-xs text-miel-muted">· {t.model}</span>
                  ) : null}
                </div>
                <p className="text-sm text-miel-ink">{t.reasoning}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
};
