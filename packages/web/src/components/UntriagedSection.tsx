import { RainbowGlow } from "@/components/ui/rainbow-glow";
import type { ListedMessage } from "../api/types";
import { useTriageActivity } from "../contexts/TriageActivityContext";
import type { PresenceState } from "../hooks/presence";
import { usePresence } from "../hooks/usePresence";
import { useSectionHeaderPresence } from "../hooks/useSectionHeaderPresence";
import { MessageRow } from "./MessageRow";
import { PresenceHeaders } from "./PresenceHeaders";
import { PresenceRow } from "./PresenceRow";
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
}

const messageKey = (m: ListedMessage) => `${m.accountId}:${m.gmailMessageId}`;

export const UntriagedSection = ({
  accountId,
  messages,
  startIndex = 0,
  selectMode,
  isSelected,
  onToggleSelect,
}: Props) => {
  const presence = usePresence(messages, messageKey);
  const headers = useSectionHeaderPresence(accountId, "untriaged", messages.length);
  const { triaging } = useTriageActivity();

  if (presence.length === 0 && headers.length === 0) return null;

  return (
    <section className="group/section flex flex-col gap-2">
      <PresenceHeaders headers={headers}>
        {(count, state) => (
          <UntriagedHeader
            count={count}
            state={state}
            selectMode={selectMode}
            messages={messages}
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
        <div className="relative z-[1] overflow-hidden rounded-md border border-gousse-line bg-gousse-panel">
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
      </div>
    </section>
  );
};

interface HeaderProps {
  count: number;
  state: PresenceState;
  selectMode?: boolean;
  messages: ListedMessage[];
}

/**
 * A leaving header shows the count it left with and carries no actions:
 * `messages` is the account being switched *to*, so acting on it from a header
 * on its way out would archive the wrong mailbox.
 */
const UntriagedHeader = ({ count, state, selectMode, messages }: HeaderProps) => {
  const live = state === "present";
  return (
    <header className="flex items-center gap-2">
      <span className="inline-flex rounded-full bg-gousse-line px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gousse-muted shadow-gousse-md">
        untriaged
      </span>
      <h2 className="text-sm font-semibold text-gousse-ink">Not yet triaged</h2>
      <span className="text-xs text-gousse-muted tabular-nums">({count})</span>
      {live && !selectMode && (
        <div className="ml-auto">
          <SectionActions messages={messages} />
        </div>
      )}
    </header>
  );
};
