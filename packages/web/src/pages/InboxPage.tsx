import { useOutletContext } from "react-router-dom";
import { useMessages } from "../api/queries";
import { PrioritySection } from "../components/PrioritySection";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import type { ListedMessage, Priority } from "../api/types";
import type { LayoutContext } from "../App";

export const InboxPage = () => {
  const { selectedAccountId, selectedLabelId } = useOutletContext<LayoutContext>();
  const { data, isLoading, error } = useMessages({
    accountId: selectedAccountId,
    labelId: selectedLabelId,
    limit: 100,
  });

  if (!selectedAccountId) {
    return (
      <EmptyState
        title="Pick an account"
        description="Choose an account in the sidebar to see triaged messages."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-miel-muted">
        <Spinner /> Loading messages…
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Couldn't load messages"
        description={(error as Error).message}
      />
    );
  }

  const items: ListedMessage[] = data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        description="Click Sync in the sidebar to fetch and triage recent messages."
      />
    );
  }

  const byPriority: Record<Priority, ListedMessage[]> = {
    high: [],
    medium: [],
    low: [],
  };
  const untriaged: ListedMessage[] = [];
  for (const m of items) {
    if (m.priority) byPriority[m.priority].push(m);
    else untriaged.push(m);
  }

  return (
    <div className="flex flex-col gap-6">
      <PrioritySection priority="high" messages={byPriority.high} />
      <PrioritySection priority="medium" messages={byPriority.medium} />
      <PrioritySection priority="low" messages={byPriority.low} />
      {untriaged.length > 0 ? (
        <section className="flex flex-col gap-2">
          <header className="flex items-center gap-2">
            <span className="inline-flex rounded bg-miel-line px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-miel-muted">
              untriaged
            </span>
            <h2 className="text-sm font-semibold text-miel-ink">
              Not yet triaged
            </h2>
            <span className="text-xs text-miel-muted">({untriaged.length})</span>
          </header>
          <div className="flex flex-col gap-2">
            {untriaged.map((m) => (
              <div
                key={`${m.accountId}:${m.gmailMessageId}`}
                className="rounded-md border border-dashed border-miel-line bg-white px-3 py-2 text-sm text-miel-muted"
              >
                {m.fromName ?? m.fromEmail} — {m.subject ?? "(no subject)"}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};
