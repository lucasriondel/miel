import { Loader2, Paperclip } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MessageAttachment } from "../api/types";
import { AttachmentMenuContent } from "./AttachmentMenuContent";
import { useAttachmentActions } from "./useAttachmentActions";

interface Props {
  accountId: string;
  gmailMessageId: string;
  attachments: MessageAttachment[];
}

/**
 * The row's second line, which exists only when the message has files (req. 2).
 *
 * It is static — not revealed on hover or by a click — because a file is a fact
 * about the message rather than an action on it, and a line that appeared under
 * the pointer would move every row below it. Rows never collapse, so the height
 * a message has is the height it keeps.
 *
 * The old compact pill run capped itself at three and clipped names to 18
 * characters to fit the space left over on one line. A line of its own has the
 * width to say the filename in full and the size beside it, so it does neither.
 */
export const MessageRowAttachmentLine = ({ accountId, gmailMessageId, attachments }: Props) => {
  if (attachments.length === 0) return null;

  return (
    // Indented to the subject's column on desktop so the files read as hanging
    // off the message rather than starting a new column of their own.
    <div className="flex flex-wrap items-center gap-1.5 pb-2.5 pl-4 pr-3 sm:pl-[13.5rem]">
      {attachments.map((a) => (
        <AttachmentChip
          key={a.attachmentId}
          accountId={accountId}
          gmailMessageId={gmailMessageId}
          attachment={a}
        />
      ))}
    </div>
  );
};

interface ChipProps {
  accountId: string;
  gmailMessageId: string;
  attachment: MessageAttachment;
}

/**
 * One file on the row's second line. The actions are `useAttachmentActions`' and
 * the menu is `AttachmentMenuContent` — the same pair the detail page's row and
 * the compact pill open, so a new face never brings a second copy of what an
 * attachment can do (#143).
 */
const AttachmentChip = ({ accountId, gmailMessageId, attachment }: ChipProps) => {
  const actions = useAttachmentActions({ accountId, gmailMessageId, attachment });
  const { busy, downloadName, sizeLabel } = actions;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={busy}
        aria-label={`Attachment ${downloadName}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-gousse-line bg-gousse-panel px-2.5 py-1 text-xs font-medium text-gousse-ink shadow-gousse-sm transition-all active:scale-[0.96] hover:bg-gousse-line/30 disabled:cursor-progress disabled:opacity-70"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Paperclip className="h-3 w-3 shrink-0 text-gousse-muted" aria-hidden />
        )}
        <span className="truncate">{busy ? "Sending…" : downloadName}</span>
        {sizeLabel && !busy ? (
          <span className="shrink-0 text-[11px] text-gousse-muted">{sizeLabel}</span>
        ) : null}
      </DropdownMenuTrigger>
      <AttachmentMenuContent attachment={attachment} actions={actions} />
    </DropdownMenu>
  );
};
