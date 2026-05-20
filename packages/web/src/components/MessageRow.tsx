import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  useApplyLabelSuggestion,
  useRemoveMessageLabel,
} from "../api/mutations";
import type { ListedMessage } from "../api/types";
import { LabelBadge } from "./LabelBadge";
import { MessageRowActions } from "./MessageRowActions";
import { SuggestedLabelBadge } from "./SuggestedLabelBadge";
import { SystemLabelBadge, isSystemLabel } from "./SystemLabelBadge";

const MAX_BADGES = 5;

interface Props {
  message: ListedMessage;
}

export const MessageRow = ({ message }: Props) => {
  const date = new Date(message.internalDate);
  const relative = Number.isNaN(date.getTime())
    ? ""
    : formatDistanceToNow(date, { addSuffix: true });
  const sender = message.fromName?.trim() || message.fromEmail;
  const subject = message.subject?.trim() || "(no subject)";
  const isUnread = message.labels.some((l) => l.name === "UNREAD");
  const appliedLabels = message.labels.filter(
    (l) => l.name !== "INBOX" && l.name !== "UNREAD",
  );
  const remaining = Math.max(0, MAX_BADGES - appliedLabels.length);
  const existingSuggestions = message.pendingSuggestions.existing.slice(
    0,
    remaining,
  );
  const newSuggestions = message.pendingSuggestions.new.slice(
    0,
    Math.max(0, remaining - existingSuggestions.length),
  );
  const visibleLabels = appliedLabels.slice(0, MAX_BADGES);
  const hasBadges =
    visibleLabels.length > 0 ||
    existingSuggestions.length > 0 ||
    newSuggestions.length > 0;

  const applySuggestion = useApplyLabelSuggestion();
  const removeLabel = useRemoveMessageLabel();
  const isApplying = applySuggestion.isPending;
  const isRemoving = removeLabel.isPending;
  const canApply = Boolean(message.triageId);

  return (
    <Link
      to={`/messages/${message.accountId}/${message.gmailMessageId}`}
      className="group relative flex items-center gap-3 border-b border-miel-line bg-miel-panel px-3 py-1.5 text-sm transition-colors last:border-b-0 hover:bg-miel-bg"
    >
      <span
        className={`w-44 shrink-0 truncate text-miel-ink ${isUnread ? "font-semibold" : "font-normal"}`}
      >
        {sender}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {hasBadges ? (
          <span className="flex shrink-0 items-center gap-1">
            {visibleLabels.map((l) =>
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
                      accountId: message.accountId,
                      gmailMessageId: message.gmailMessageId,
                      labelId: l.id,
                    })
                  }
                />
              ),
            )}
            {existingSuggestions.map((s) => (
              <SuggestedLabelBadge
                key={`existing:${s.labelId}`}
                name={s.name}
                kind="existing"
                disabled={isApplying || !canApply}
                onClick={
                  canApply && message.triageId
                    ? () =>
                        applySuggestion.mutate({
                          accountId: message.accountId,
                          gmailMessageId: message.gmailMessageId,
                          triageId: message.triageId!,
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
            {newSuggestions.map((s) => (
              <SuggestedLabelBadge
                key={`new:${s.suggestionId}`}
                name={s.name}
                kind="new"
                disabled={isApplying || !canApply}
                onClick={
                  canApply && message.triageId
                    ? () =>
                        applySuggestion.mutate({
                          accountId: message.accountId,
                          gmailMessageId: message.gmailMessageId,
                          triageId: message.triageId!,
                          kind: "new",
                          suggestionId: s.suggestionId,
                        })
                    : undefined
                }
              />
            ))}
          </span>
        ) : null}
        <span className="min-w-0 truncate">
          <span className={`text-miel-ink ${isUnread ? "font-semibold" : ""}`}>
            {subject}
          </span>
          {message.snippet ? (
            <span className="text-miel-muted"> - {message.snippet}</span>
          ) : null}
        </span>
      </div>
      <span className="shrink-0 text-xs text-miel-muted">{relative}</span>
      <MessageRowActions
        accountId={message.accountId}
        gmailMessageId={message.gmailMessageId}
        isUnread={isUnread}
      />
    </Link>
  );
};
