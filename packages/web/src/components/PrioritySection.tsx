import type { ListedMessage, Priority } from "../api/types";
import { MessageRow } from "./MessageRow";
import { PrioritySectionEmpty } from "./PrioritySectionEmpty";
import { SectionActions } from "./SectionActions";
import { Spinner } from "./Spinner";

interface Props {
  priority: Priority;
  messages: ListedMessage[];
  isLoading?: boolean;
}

const labels: Record<Priority, { title: string; chip: string }> = {
  high: { title: "High priority", chip: "bg-miel-high text-white" },
  medium: { title: "Medium priority", chip: "bg-miel-medium text-white" },
  low: { title: "Low priority", chip: "bg-miel-low text-white" },
};

export const PrioritySection = ({ priority, messages, isLoading }: Props) => {
  const meta = labels[priority];
  return (
    <section className="group/section flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <span
          className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide ${meta.chip}`}
        >
          {priority}
        </span>
        <h2 className="text-sm font-semibold text-miel-ink">{meta.title}</h2>
        <span className="text-xs text-miel-muted">({messages.length})</span>
        {isLoading ? <Spinner size={12} /> : null}
        <div className="ml-auto">
          <SectionActions messages={messages} />
        </div>
      </header>
      {messages.length === 0 ? (
        <PrioritySectionEmpty priority={priority} />
      ) : (
        <div className="overflow-hidden rounded-md border border-miel-line bg-white">
          {messages.map((m) => (
            <MessageRow key={`${m.accountId}:${m.gmailMessageId}`} message={m} />
          ))}
        </div>
      )}
    </section>
  );
};
