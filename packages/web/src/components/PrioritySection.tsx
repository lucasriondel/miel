import type { ListedMessage, Priority } from "../api/types";
import type { PresenceState } from "../hooks/presence";
import { usePresence } from "../hooks/usePresence";
import { useSectionHeaderPresence } from "../hooks/useSectionHeaderPresence";
import { MessageRow } from "./MessageRow";
import { PresenceHeaders } from "./PresenceHeaders";
import { PresenceRow } from "./PresenceRow";
import { SectionActions } from "./SectionActions";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  /** The account the list is showing — the header's identity, so switching plays an exit/enter. */
  accountId: string;
  priority: Priority;
  messages: ListedMessage[];
  /** Global row offset so the appear stagger flows across sections, not per-section. */
  startIndex?: number;
  isLoading?: boolean;
  selectMode?: boolean;
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleSelect?: (accountId: string, gmailMessageId: string) => void;
}

const labels: Record<Priority, { title: string; chip: string }> = {
  high: { title: "High priority", chip: "bg-gousse-high text-white" },
  medium: { title: "Medium priority", chip: "bg-gousse-medium text-white" },
  low: { title: "Low priority", chip: "bg-gousse-low text-white" },
};

const messageKey = (m: ListedMessage) => `${m.accountId}:${m.gmailMessageId}`;

export const PrioritySection = ({
  accountId,
  priority,
  messages,
  startIndex = 0,
  isLoading,
  selectMode,
  isSelected,
  onToggleSelect,
}: Props) => {
  const presence = usePresence(messages, messageKey);
  const headers = useSectionHeaderPresence(accountId, priority, messages.length);

  if (presence.length === 0 && headers.length === 0) return null;

  return (
    <section className="group/section flex flex-col gap-3">
      <PresenceHeaders headers={headers}>
        {(count, state) => (
          <PriorityHeader
            priority={priority}
            count={count}
            state={state}
            isLoading={isLoading}
            selectMode={selectMode}
            messages={messages}
          />
        )}
      </PresenceHeaders>
      <div className="overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel shadow-gousse-md">
        {presence.map(({ item: m, key, state }, idx) => (
          <PresenceRow key={key} state={state} index={startIndex + idx}>
            <MessageRow
              message={m}
              selectMode={selectMode}
              selected={isSelected?.(m.accountId, m.gmailMessageId) ?? false}
              onToggleSelect={onToggleSelect}
            />
          </PresenceRow>
        ))}
      </div>
    </section>
  );
};

interface HeaderProps {
  priority: Priority;
  count: number;
  state: PresenceState;
  isLoading?: boolean;
  selectMode?: boolean;
  messages: ListedMessage[];
}

/**
 * A leaving header shows the count it left with and carries neither the spinner
 * nor the actions: `messages` is the account being switched *to*, so acting on
 * it from a header on its way out would archive the wrong mailbox.
 */
const PriorityHeader = ({
  priority,
  count,
  state,
  isLoading,
  selectMode,
  messages,
}: HeaderProps) => {
  const meta = labels[priority];
  const live = state === "present";
  return (
    <header className="flex items-center gap-3">
      <span
        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider shadow-gousse-md ${meta.chip}`}
      >
        {priority}
      </span>
      <h2 className="text-base font-bold text-gousse-ink">{meta.title}</h2>
      <span className="text-sm font-medium text-gousse-muted tabular-nums">({count})</span>
      {live && isLoading ? <Spinner size={14} /> : null}
      {live && !selectMode && (
        <div className="ml-auto">
          <SectionActions messages={messages} />
        </div>
      )}
    </header>
  );
};
