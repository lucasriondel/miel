import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { MessageAttachment } from "../api/types";
import { downloadAttachment } from "../api/downloadAttachment";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { assetUrl } from "../lib/basePath";
import {
  extractFiledFilename,
  sendAttachmentToWorp,
  type WorpFlow,
} from "../api/sendAttachmentToWorp";
import { useWorpSettings } from "../api/worpSettings.hooks";
import { formatSize, truncateFilename } from "./attachmentDisplay";
import { isWorpAcceptedMime } from "./isWorpAcceptedMime";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  accountId: string;
  gmailMessageId: string;
  attachment: MessageAttachment;
}

const PaperclipIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-3 w-3"
  >
    <path d="M21.44 11.05l-9.19 9.19a5.5 5.5 0 01-7.78-7.78l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.19 9.19a1.5 1.5 0 01-2.12-2.12l8.49-8.49" />
  </svg>
);

const WorpIcon = () => (
  <img src={assetUrl("/worp-favicon.png")} alt="" aria-hidden="true" className="h-4 w-4" />
);

const FLOWS: readonly WorpFlow[] = ["personal", "pro"];

export const AttachmentPill = ({ accountId, gmailMessageId, attachment }: Props) => {
  const [busy, setBusy] = useState(false);

  const label = truncateFilename(attachment.filename, 18);
  const downloadName = attachment.filename || "attachment";
  const sizeLabel = attachment.size > 0 ? formatSize(attachment.size) : null;
  // Two conditions, both required: worp takes this kind of file, and worp is
  // actually configured. Since #107 the relay is off on a fresh install until
  // someone fills in Settings → Integrations, so offering the action
  // unconditionally would mean a menu whose only outcome is a 503.
  const worpSettings = useWorpSettings();
  const worpEligible =
    isWorpAcceptedMime(attachment.mimeType, attachment.filename) &&
    worpSettings.data?.configured === true;

  const handleDownload = async () => {
    setBusy(true);
    try {
      await downloadAttachment({
        accountId,
        gmailMessageId,
        attachmentId: attachment.attachmentId,
        filename: downloadName,
      });
    } catch (err) {
      toast.error(`Could not download ${downloadName}: ${apiErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSendToWorp = async (flow: WorpFlow) => {
    setBusy(true);
    try {
      const res = await sendAttachmentToWorp({
        accountId,
        gmailMessageId,
        attachmentId: attachment.attachmentId,
        flow,
      });
      const filed = extractFiledFilename(res.result) ?? downloadName;
      toast.success(`Sent to worp (${flow})`, { description: `Filed as ${filed}` });
    } catch (err) {
      toast.error(`Could not send ${downloadName} to worp: ${apiErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        disabled={busy}
        title={sizeLabel ? `${downloadName} (${sizeLabel})` : downloadName}
        aria-label={`Attachment ${downloadName}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-md border border-gousse-line bg-gousse-line/20 px-2 py-1 text-xs font-medium text-gousse-ink shadow-gousse-sm transition-all active:scale-[0.96] hover:bg-gousse-line/40 disabled:cursor-progress disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <PaperclipIcon />}
        <span className="truncate">{busy ? "Sending…" : label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="truncate normal-case tracking-normal">
          {downloadName}
        </DropdownMenuLabel>
        <div className="px-2.5 pb-1 text-[11px] text-gousse-muted">
          {attachment.mimeType || "application/octet-stream"}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
        </div>
        <DropdownMenuItem onClick={handleDownload}>
          <Download className="h-4 w-4" aria-hidden />
          Download
        </DropdownMenuItem>
        {worpEligible && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <WorpIcon />
              Send to worp
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {FLOWS.map((flow) => (
                <DropdownMenuItem
                  key={flow}
                  className="capitalize"
                  onClick={() => handleSendToWorp(flow)}
                >
                  {flow}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
