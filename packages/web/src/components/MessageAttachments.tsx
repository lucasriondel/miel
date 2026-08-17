import type { MessageAttachment } from "../api/types";
import { AttachmentPill } from "./AttachmentPill";

interface Props {
  accountId: string;
  gmailMessageId: string;
  attachments: MessageAttachment[];
  /** "row": inline shrink-0 cap; "full": wrap. */
  variant?: "row" | "full";
  maxBadges?: number;
  className?: string;
}

const DEFAULT_MAX = 3;

export const MessageAttachments = ({
  accountId,
  gmailMessageId,
  attachments,
  variant = "full",
  maxBadges,
  className = "",
}: Props) => {
  if (attachments.length === 0) return null;

  const cap = variant === "row" ? (maxBadges ?? DEFAULT_MAX) : attachments.length;
  const shown = attachments.slice(0, cap);
  const overflow = attachments.length - shown.length;

  const wrapperClass =
    variant === "row" ? "flex shrink-0 items-center gap-1" : "flex flex-wrap items-center gap-1.5";

  return (
    <div className={`${wrapperClass} ${className}`.trim()}>
      {shown.map((a) => (
        <AttachmentPill
          key={a.attachmentId}
          accountId={accountId}
          gmailMessageId={gmailMessageId}
          attachment={a}
        />
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center rounded-md border border-gousse-line bg-gousse-line/20 px-2 py-1 text-xs font-medium text-gousse-muted shadow-gousse-sm"
          title={`${overflow} more attachment${overflow === 1 ? "" : "s"}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
};
