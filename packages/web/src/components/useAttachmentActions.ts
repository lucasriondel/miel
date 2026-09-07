import { useState } from "react";
import { toast } from "sonner";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { downloadAttachment } from "../api/downloadAttachment";
import {
  extractFiledFilename,
  sendAttachmentToWorp,
  type WorpFlow,
} from "../api/sendAttachmentToWorp";
import type { MessageAttachment } from "../api/types";
import { useWorpSettings } from "../api/worpSettings.hooks";
import { formatSize } from "./attachmentDisplay";
import { isWorpAcceptedMime } from "./isWorpAcceptedMime";

export interface AttachmentTarget {
  accountId: string;
  gmailMessageId: string;
  attachment: MessageAttachment;
}

export interface AttachmentActions {
  /** A request is in flight; the trigger that owns it should say so and refuse clicks. */
  busy: boolean;
  /** The filename to show and to save under — never empty. */
  downloadName: string;
  /** A human size, or null for an attachment the server reported as empty. */
  sizeLabel: string | null;
  worpEligible: boolean;
  download: () => Promise<void>;
  sendToWorp: (flow: WorpFlow) => Promise<void>;
}

/**
 * Everything an attachment can do, independent of what it looks like: the two
 * requests, the busy flag they share, and whether the worp relay may be offered
 * at all. Two presentations use it — the inbox row's pill (`AttachmentPill`) and
 * the detail page's row (`features/message-detail/AttachmentRow`) — and the
 * point of the seam is that they cannot drift on the answers, only on the shape.
 */
export const useAttachmentActions = ({
  accountId,
  gmailMessageId,
  attachment,
}: AttachmentTarget): AttachmentActions => {
  const [busy, setBusy] = useState(false);

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

  const download = async () => {
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

  const sendToWorp = async (flow: WorpFlow) => {
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

  return { busy, downloadName, sizeLabel, worpEligible, download, sendToWorp };
};
