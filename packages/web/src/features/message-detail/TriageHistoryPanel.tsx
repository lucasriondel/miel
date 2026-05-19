import { format } from "date-fns";
import type { MessageDetail, Priority } from "../../api/types";

interface Props {
  message: MessageDetail;
}

const priorityChipStyles: Record<Priority, string> = {
  high: "bg-miel-high text-white",
  medium: "bg-miel-medium text-white",
  low: "bg-miel-low text-white",
};

export const TriageHistoryPanel = ({ message }: Props) => {
  if (message.triageHistory.length === 0) {
    return (
      <section className="rounded-md border border-miel-line bg-white p-4">
        <h2 className="text-sm font-semibold text-miel-ink">Triage history</h2>
        <p className="mt-1 text-sm text-miel-muted">No triage runs recorded.</p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-miel-line bg-white p-4">
      <h2 className="text-sm font-semibold text-miel-ink">Triage history</h2>
      <ol className="mt-3 flex flex-col gap-3">
        {message.triageHistory.map((t) => (
          <li
            key={t.id}
            className="flex flex-col gap-1 border-l-2 border-miel-line pl-3"
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${priorityChipStyles[t.priority]}`}
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
    </section>
  );
};
