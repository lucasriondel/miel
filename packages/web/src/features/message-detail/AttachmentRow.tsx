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
        className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition-[background-color,transform] duration-150 active:scale-[0.98] hover:bg-gousse-line/20 disabled:cursor-progress disabled:opacity-70"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gousse-line/40 text-gousse-muted">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Paperclip className="h-4 w-4" aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {/* Truncated only when a name outruns the row, hence the title (§4). */}
          <span className="truncate text-sm font-semibold text-gousse-ink">{downloadName}</span>
          <span className="truncate text-xs font-medium text-gousse-muted">
            {attachment.mimeType || "application/octet-stream"}
            {sizeLabel ? ` · ${sizeLabel}` : ""}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gousse-muted" aria-hidden />
      </DropdownMenuTrigger>
      <AttachmentMenuContent attachment={attachment} actions={actions} />
    </DropdownMenu>
  );
};
