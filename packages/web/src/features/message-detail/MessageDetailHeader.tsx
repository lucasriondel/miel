import { format } from "date-fns";
import type { MessageDetail, Priority } from "../../api/types";
import { LabelBadge } from "../../components/LabelBadge";

interface Props {
  message: MessageDetail;
}

const priorityChipStyles: Record<Priority, string> = {
  high: "bg-miel-high text-white",
  medium: "bg-miel-medium text-white",
  low: "bg-miel-low text-white",
};

export const MessageDetailHeader = ({ message }: Props) => {
  const latestPriority = message.triageHistory[0]?.priority;
  const visibleLabels = message.labels.filter((l) => l.gmailLabelId !== "INBOX");

  return (
    <header className="flex flex-col gap-3 border-b border-miel-line pb-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-miel-ink">
          {message.subject ?? "(no subject)"}
        </h1>
        {latestPriority ? (
          <span
            className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${priorityChipStyles[latestPriority]}`}
          >
            {latestPriority}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded border border-dashed border-miel-line px-2 py-0.5 text-xs font-medium text-miel-muted">
            untriaged
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-miel-muted">From</dt>
        <dd className="text-miel-ink">
          {message.fromName ? (
            <>
              <span className="font-medium">{message.fromName}</span>{" "}
              <span className="text-miel-muted">&lt;{message.fromEmail}&gt;</span>
            </>
          ) : (
            message.fromEmail
          )}
        </dd>
        <dt className="text-miel-muted">To</dt>
        <dd className="text-miel-ink">
          {message.toEmails.length > 0 ? message.toEmails.join(", ") : "—"}
        </dd>
        <dt className="text-miel-muted">Date</dt>
        <dd className="text-miel-ink">
          {format(new Date(message.internalDate), "PPpp")}
        </dd>
        <dt className="text-miel-muted">Account</dt>
        <dd className="text-miel-ink">{message.accountEmail}</dd>
      </dl>
      {visibleLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {visibleLabels.map((l) => (
            <LabelBadge key={l.id} name={l.name} />
          ))}
        </div>
      ) : null}
    </header>
  );
};
