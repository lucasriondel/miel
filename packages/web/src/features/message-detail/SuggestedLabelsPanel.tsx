import type { MessageDetail } from "../../api/types";
import { SuggestedLabelBadge } from "../../components/SuggestedLabelBadge";

interface Props {
  message: MessageDetail;
}

const statusStyles: Record<"pending" | "applied" | "dismissed", string> = {
  pending: "bg-white text-miel-ink border-miel-line",
  applied: "bg-miel-low/10 text-miel-low border-miel-low/30",
  dismissed: "bg-miel-bg text-miel-muted border-miel-line",
};

export const SuggestedLabelsPanel = ({ message }: Props) => {
  const latest = message.triageHistory[0];
  if (!latest) {
    return (
      <section className="rounded-md border border-miel-line bg-white p-4">
        <h2 className="text-sm font-semibold text-miel-ink">Label suggestions</h2>
        <p className="mt-1 text-sm text-miel-muted">
          This message has not been triaged yet — run a sync to generate suggestions.
        </p>
      </section>
    );
  }

  const hasAny =
    latest.existingLabelSuggestions.length > 0 ||
    latest.newLabelSuggestions.length > 0;

  return (
    <section className="rounded-md border border-miel-line bg-white p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-miel-ink">Label suggestions</h2>
        <span className="text-xs text-miel-muted">
          from triage {latest.id.slice(0, 8)}
        </span>
      </header>
      {!hasAny ? (
        <p className="mt-2 text-sm text-miel-muted">
          Claude did not suggest any labels for this message.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {latest.existingLabelSuggestions.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-miel-muted">
                Existing labels
              </p>
              <ul className="flex flex-col gap-1">
                {latest.existingLabelSuggestions.map((s) => (
                  <li
                    key={s.labelId}
                    className="flex items-center justify-between gap-2"
                  >
                    <SuggestedLabelBadge name={s.name} kind="existing" />
                    <span
                      className={`rounded border px-1.5 py-0.5 text-xs font-medium ${statusStyles[s.status]}`}
                    >
                      {s.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {latest.newLabelSuggestions.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-miel-muted">
                New labels
              </p>
              <ul className="flex flex-col gap-1">
                {latest.newLabelSuggestions.map((s) => (
                  <li
                    key={s.suggestionId}
                    className="flex items-start justify-between gap-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <SuggestedLabelBadge name={s.name} kind="new" />
                      {s.reasoning ? (
                        <span className="text-xs text-miel-muted">
                          {s.reasoning}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-xs font-medium ${statusStyles[s.status]}`}
                    >
                      {s.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
};
