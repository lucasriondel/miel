import {
  useApplyLabelSuggestion,
  useRemoveMessageLabel,
} from "../api/mutations";
import type {
  MessageLabel,
  PendingExistingLabelSuggestion,
  PendingNewLabelSuggestion,
} from "../api/types";
import { LabelBadge } from "./LabelBadge";
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

  const hasAny =
    appliedLabels.length > 0 || existing.length > 0 || nu.length > 0;
  if (!hasAny) return null;

  const wrapperClass =
    variant === "row"
      ? "flex shrink-0 items-center gap-1"
      : "flex flex-wrap items-center gap-1.5";

  return (
    <span className={wrapperClass}>
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
      {existing.map((s) => (
        <SuggestedLabelBadge
          key={`existing:${s.labelId}`}
          name={s.name}
          kind="existing"
          disabled={isApplying || !canApply}
          onClick={
            canApply && triageId
              ? () =>
                  applySuggestion.mutate({
                    accountId,
                    gmailMessageId,
                    triageId,
                    kind: "existing",
                    labelId: s.labelId,
                    name: s.name,
                    colorBg: s.colorBg,
                    colorFg: s.colorFg,
                  })
              : undefined
          }
        />
      ))}
      {nu.map((s) => (
        <SuggestedLabelBadge
          key={`new:${s.suggestionId}`}
          name={s.name}
          kind="new"
          disabled={isApplying || !canApply}
          onClick={
            canApply && triageId
              ? () =>
                  applySuggestion.mutate({
                    accountId,
                    gmailMessageId,
                    triageId,
                    kind: "new",
                    suggestionId: s.suggestionId,
                  })
              : undefined
          }
        />
      ))}
    </span>
  );
};
