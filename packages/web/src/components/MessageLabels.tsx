import { useApplyLabelSuggestion, useRemoveMessageLabel } from "../api/mutations";
import type {
  MessageLabel,
  PendingExistingLabelSuggestion,
  PendingNewLabelSuggestion,
} from "../api/types";
import { LabelBadge } from "./LabelBadge";
import { MobileSuggestionsBadge } from "./MobileSuggestionsBadge";
import { SuggestedLabelBadge } from "./SuggestedLabelBadge";
import { SystemLabelBadge, isSystemLabel } from "./SystemLabelBadge";

interface Props {
  accountId: string;
  gmailMessageId: string;
  triageId: string | null;
  labels: MessageLabel[];
  existingSuggestions: PendingExistingLabelSuggestion[];
  newSuggestions: PendingNewLabelSuggestion[];
  /** "row": one-line cap with shrink-0; "full": wrap. */
  variant?: "row" | "full";
  /** Cap applied to the combined badge count (used by row variant). */
  maxBadges?: number;
  /** Hide INBOX/UNREAD system labels (already filtered upstream by row variant). */
  hideInbox?: boolean;
  /** Extra wrapper classes (used to control order/margins in MessageRow). */
  className?: string;
}

const DEFAULT_MAX = 5;

export const MessageLabels = ({
  accountId,
  gmailMessageId,
  triageId,
  labels,
  existingSuggestions,
  newSuggestions,
  variant = "full",
  maxBadges,
  hideInbox = true,
  className = "",
}: Props) => {
  const applySuggestion = useApplyLabelSuggestion();
  const removeLabel = useRemoveMessageLabel();
  const isApplying = applySuggestion.isPending;
  const isRemoving = removeLabel.isPending;
  const canApply = Boolean(triageId);

  const visible = hideInbox
    ? labels.filter((l) => l.name !== "INBOX" && l.name !== "UNREAD")
    : labels;

  let appliedLabels = visible;
  let existing = existingSuggestions;
  let nu = newSuggestions;

  if (variant === "row") {
    const cap = maxBadges ?? DEFAULT_MAX;
    appliedLabels = visible.slice(0, cap);
    const remaining = Math.max(0, cap - appliedLabels.length);
    existing = existingSuggestions.slice(0, remaining);
    nu = newSuggestions.slice(0, Math.max(0, remaining - existing.length));
  }

  const hasAny = appliedLabels.length > 0 || existing.length > 0 || nu.length > 0;
  if (!hasAny) return null;

  const wrapperClass =
    variant === "row" ? "flex shrink-0 items-center gap-1" : "flex flex-wrap items-center gap-1.5";

  const applyExisting = (s: PendingExistingLabelSuggestion) => {
    if (!canApply || !triageId) return;
    applySuggestion.mutate({
      accountId,
      gmailMessageId,
      triageId,
      kind: "existing",
      labelId: s.labelId,
      name: s.name,
      colorBg: s.colorBg,
      colorFg: s.colorFg,
    });
  };
  const applyNew = (s: PendingNewLabelSuggestion) => {
    if (!canApply || !triageId) return;
    applySuggestion.mutate({
      accountId,
      gmailMessageId,
      triageId,
      kind: "new",
      suggestionId: s.suggestionId,
    });
  };

  const hasSuggestions = existing.length > 0 || nu.length > 0;

  return (
    <div className={`${wrapperClass} ${className}`.trim()}>
      {appliedLabels.map((l) =>
        isSystemLabel(l.name) ? (
          <SystemLabelBadge key={l.id} name={l.name} />
        ) : (
          <LabelBadge
            key={l.id}
            name={l.name}
            colorBg={l.colorBg}
            colorFg={l.colorFg}
            removeDisabled={isRemoving}
            onRemove={() =>
              removeLabel.mutate({
                accountId,
                gmailMessageId,
                labelId: l.id,
              })
            }
          />
        ),
      )}
      {/* Mobile (row variant): collapse all suggestions into a single +N pill. */}
      {variant === "row" && hasSuggestions && (
        <div className="sm:hidden">
          <MobileSuggestionsBadge
            existingSuggestions={existing}
            newSuggestions={nu}
            disabled={isApplying || !canApply}
            onApplyExisting={applyExisting}
            onApplyNew={applyNew}
          />
        </div>
      )}
      {/* Desktop (and "full" variant): inline suggestion pills. */}
      <div className={variant === "row" ? "hidden items-center gap-1 sm:inline-flex" : "contents"}>
        {existing.map((s) => (
          <SuggestedLabelBadge
            key={`existing:${s.labelId}`}
            name={s.name}
            kind="existing"
            disabled={isApplying || !canApply}
            onClick={canApply && triageId ? () => applyExisting(s) : undefined}
          />
        ))}
        {nu.map((s) => (
          <SuggestedLabelBadge
            key={`new:${s.suggestionId}`}
            name={s.name}
            kind="new"
            disabled={isApplying || !canApply}
            onClick={canApply && triageId ? () => applyNew(s) : undefined}
          />
        ))}
      </div>
    </div>
  );
};
