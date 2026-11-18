import { ChevronDown, Loader2, Paperclip } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MessageAttachment } from "../../api/types";
import { AttachmentMenuContent } from "../../components/AttachmentMenuContent";
import { useAttachmentActions } from "../../components/useAttachmentActions";

interface Props {
  accountId: string;
  gmailMessageId: string;
  attachment: MessageAttachment;
}

/**
 * One attachment as a row of the detail page's attachments card: the filename
 * in full, its type and size under it, and the same menu the inbox row's pill
 * opens. Full-bleed rather than a badge — these arrived with the message, so
 * they read as a list of files and not as more metadata about it (#143).
 *
 * `px-5` is the card inset the `rounded-3xl` surface asks for (DESIGN.md §3),
 * and the press scale is the wide-row `0.98` rather than a button's `0.96`.
 */
export const AttachmentRow = ({ accountId, gmailMessageId, attachment }: Props) => {
  const actions = useAttachmentActions({ accountId, gmailMessageId, attachment });
  const { busy, downloadName, sizeLabel } = actions;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={busy}
        title={downloadName}
        aria-label={`Attachment ${downloadName}`}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-gousse-hover disabled:cursor-progress disabled:opacity-70"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gousse-fill text-gousse-muted">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {/* Truncated only when a name outruns the row, hence the title (§4). */}
          <span className="truncate text-[13px] font-semibold text-gousse-ink">{downloadName}</span>
          <span className="truncate text-xs text-gousse-muted">
            {attachment.mimeType || "application/octet-stream"}
            {sizeLabel ? ` · ${sizeLabel}` : ""}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gousse-muted" aria-hidden />
      </DropdownMenuTrigger>
      <AttachmentMenuContent attachment={attachment} actions={actions} />
    </DropdownMenu>
  );
};
