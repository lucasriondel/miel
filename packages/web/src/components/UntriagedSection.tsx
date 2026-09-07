import { RainbowGlow } from "@/components/ui/rainbow-glow";
import type { ListedMessage } from "../api/types";
import { useTriageActivity } from "../contexts/TriageActivityContext";
import type { PresenceState } from "../hooks/presence";
import { usePresence } from "../hooks/usePresence";
import { useSectionHeaderPresence } from "../hooks/useSectionHeaderPresence";
import { CategorySelectButton } from "../features/select/CategorySelectButton";
import { CategoryGroupList } from "./CategoryGroupList";
import { PresenceHeaders } from "./PresenceHeaders";
import { SectionCount } from "./SectionCount";
import { SectionActions } from "./SectionActions";

interface Props {
  /** The account the list is showing — the header's identity, so switching plays an exit/enter. */
  accountId: string;
  messages: ListedMessage[];
  /** Global row offset so the appear stagger flows across sections, not per-section. */
  startIndex?: number;
  selectMode?: boolean;
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleSelect?: (accountId: string, gmailMessageId: string) => void;
  /** Selects this whole category, or clears it when it is already whole (#146). */
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
}

const messageKey = (m: ListedMessage) => `${m.accountId}:${m.gmailMessageId}`;

export const UntriagedSection = ({
  accountId,
  messages,
  startIndex = 0,
  selectMode,
  isSelected,
  onToggleSelect,
  onToggleCategory,
}: Props) => {
  const presence = usePresence(messages, messageKey);
  const headers = useSectionHeaderPresence(accountId, "untriaged", messages.length);
  const { triaging } = useTriageActivity();

  if (presence.length === 0 && headers.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <PresenceHeaders headers={headers}>
        {(count, state) => (
          <UntriagedHeader
            accountId={accountId}
            count={count}
            state={state}
            selectMode={selectMode}
            messages={messages}
            isSelected={isSelected}
            onToggleCategory={onToggleCategory}
          />
        )}
      </PresenceHeaders>
      <div className="relative rounded-md">
        {/* trigger="hover" + a non-.group host keeps the halo dark at rest;
            `active` is the only thing that lights it — i.e. only while triaging.
            The `--card` glow defaults to a 24px frame radius; override it to hug
            this section's small `rounded-md` (6px) card + the -3px inset so the
            halo tracks the corners instead of bulging past them. */}
        <RainbowGlow variant="card" trigger="hover" active={triaging} className="!rounded-[9px]" />
        {/* Untriaged is a category in the same sense the priorities are (#146),
            so its card groups by Gmail category the same way theirs do. */}
        <div className="relative z-[1] overflow-hidden rounded-md border border-gousse-line bg-gousse-panel">
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
      </div>
    </section>
  );
};

interface HeaderProps {
  accountId: string;
  count: number;
  state: PresenceState;
  selectMode?: boolean;
  messages: ListedMessage[];
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
}

/**
 * A leaving header shows the count it left with and carries no actions:
 * `messages` is the account being switched *to*, so acting on it from a header
 * on its way out would archive the wrong mailbox.
 */
const UntriagedHeader = ({
  accountId,
  count,
  state,
  selectMode,
  messages,
  isSelected,
  onToggleCategory,
}: HeaderProps) => {
  const live = state === "present";
  return (
    // Same row rules as the priority header (#144): permanently visible actions,
    // so the heading is the one element that truncates.
    <header className="flex items-center gap-2 sm:gap-3">
      {/* Untriaged is a category in the same sense the three priorities are, so
          it is named the way they are: the heading says which one, with the
          count beside it. It carries no colour because it carries no verdict —
          nothing has judged these yet. */}
      <h2 className="min-w-0 truncate text-base font-bold text-gousse-ink">Untriaged</h2>
      <SectionCount category="untriaged" count={count} />
      {live && (
        // Untriaged is a category in the same sense (#146), so it carries the
        // same select — in both modes, with the three flag actions still select
        // mode's to own. The right inset is the priority header's, for its
        // reason: 16px to match the card's own `px-4`, plus the card's 1px
        // border, which this header sits outside of.
        <div className="ml-auto flex shrink-0 items-center gap-1 pr-[calc(1rem+1px)]">
          <CategorySelectButton
            category="untriaged"
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
