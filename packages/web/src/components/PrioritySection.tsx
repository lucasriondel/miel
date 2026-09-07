import type { ListedMessage, Priority } from "../api/types";
import type { PresenceState } from "../hooks/presence";
import { usePresence } from "../hooks/usePresence";
import { useSectionHeaderPresence } from "../hooks/useSectionHeaderPresence";
import { CategorySelectButton } from "../features/select/CategorySelectButton";
import { priorityInk } from "../lib/priorityColors";
import { CategoryGroupList } from "./CategoryGroupList";
import { PresenceHeaders } from "./PresenceHeaders";
import { SectionCount } from "./SectionCount";
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
  /** Selects this whole category, or clears it when it is already whole (#146). */
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
}

/** These are the priority, spelled out: since #141 the heading carries the
 *  colour instead of a pill beside it, so the words have to say which verdict
 *  this is. What colours them is `lib/priorityColors`, which the detail view's
 *  triage row reads too; only the wording is this section's. The heading says
 *  the level alone — the column it sits in is priorities, so the noun was
 *  three times redundant. */
const titles: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** The category select's label is read out of context — a button name, not a
 *  heading with its column around it — so it keeps the noun the heading drops. */
const categoryName = (priority: Priority) => `${titles[priority].toLowerCase()} priority`;

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
  onToggleCategory,
}: Props) => {
  const presence = usePresence(messages, messageKey);
  const headers = useSectionHeaderPresence(accountId, priority, messages.length);

  if (presence.length === 0 && headers.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <PresenceHeaders headers={headers}>
        {(count, state) => (
          <PriorityHeader
            accountId={accountId}
            priority={priority}
            count={count}
            state={state}
            isLoading={isLoading}
            selectMode={selectMode}
            messages={messages}
            isSelected={isSelected}
            onToggleCategory={onToggleCategory}
          />
        )}
      </PresenceHeaders>
      {/* The card keeps its production shape exactly — the coloured heading and
          its count chip stay outside it, and it stays a rounded, bordered,
          shadowed panel. All that changed is its interior, which is now the
          category subgroups rather than a flat run of rows (req. 8). */}
      <div className="overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel shadow-gousse-md">
        <CategoryGroupList
          accountId={accountId}
          presence={presence}
          startIndex={startIndex}
          selectMode={selectMode}
          isSelected={isSelected}
          onToggleSelect={onToggleSelect}
          onToggleCategory={onToggleCategory}
        />
      </div>
    </section>
  );
};

interface HeaderProps {
  accountId: string;
  priority: Priority;
  count: number;
  state: PresenceState;
  isLoading?: boolean;
  selectMode?: boolean;
  messages: ListedMessage[];
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
}

/**
 * A leaving header shows the count it left with and carries neither the spinner
 * nor the actions: `messages` is the account being switched *to*, so acting on
 * it from a header on its way out would archive the wrong mailbox.
 */
const PriorityHeader = ({
  accountId,
  priority,
  count,
  state,
  isLoading,
  selectMode,
  messages,
  isSelected,
  onToggleCategory,
}: HeaderProps) => {
  const live = state === "present";
  return (
    // The actions no longer wait for a hover (#144), so the row has to hold all
    // of it at any width: the heading is the only part allowed to give way, and
    // the gap tightens below `sm` to buy it a few characters back.
    <header className="flex items-center gap-2 sm:gap-3">
      {/* The verdict is the colour of the heading (#141), not a pill in front of
          it — and the heading still says which priority it is, so the colour is
          emphasis rather than the only thing carrying the distinction. */}
      <h2 className={`min-w-0 truncate text-base font-bold ${priorityInk(priority)}`}>
        {titles[priority]}
      </h2>
      <SectionCount category={priority} count={count} />
      {live && isLoading ? (
        <span className="shrink-0">
          <Spinner size={14} />
        </span>
      ) : null}
      {live && (
        // One cell for everything the header acts with. The category select is
        // in both modes; the three flag actions are select mode's to own.
        //
        // This strip has to end on the same column as the category headers'
        // and the rows' inside the card below, which inset their own actions by
        // `px-4`/`pr-4` from the card's *content* box. This header is outside
        // the card, so the same 16px would land 1px wide of them: the card has
        // a 1px border, and that border is inside its width. Hence the extra
        // pixel rather than a bare `pr-4` — it is the border, not a nudge.
        <div className="ml-auto flex shrink-0 items-center gap-1 pr-[calc(1rem+1px)]">
          <CategorySelectButton
            category={categoryName(priority)}
            accountId={accountId}
            messages={messages}
            isSelected={isSelected}
            onToggleCategory={onToggleCategory}
          />
          {!selectMode && <SectionActions messages={messages} />}
        </div>
      )}
    </header>
  );
};
