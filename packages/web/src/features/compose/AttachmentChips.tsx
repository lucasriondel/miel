import type { QuoteAttachment } from "../../api/composeReads.hooks";
import { AttachmentChip } from "./AttachmentChip";
import type { UploadChip } from "./composeSession";

interface Props {
  /** A forward's original files still carried. */
  originals: readonly QuoteAttachment[];
  uploads: readonly UploadChip[];
  onRemoveOriginal: (attachmentId: string) => void;
  onRemoveUpload: (key: string) => void;
  /** Sending or sent: the chips stay, their remove controls go. */
  locked: boolean;
}

/**
 * The files a message carries, as one wrapping row of chips: a forward's
 * originals first (they came with the message), then what was attached here.
 * Removing an original only drops it from this forward.
 */
export const AttachmentChips = ({
  originals,
  uploads,
  onRemoveOriginal,
  onRemoveUpload,
  locked,
}: Props) =>
  originals.length === 0 && uploads.length === 0 ? null : (
    <ul aria-label="Attachments" className="flex shrink-0 flex-wrap gap-1.5 px-5 pt-1 pb-3">
      {originals.map((file) => (
        <li key={file.attachmentId} className="max-w-full">
          <AttachmentChip
            filename={file.filename}
            size={file.size}
            status="ready"
            onRemove={locked ? undefined : () => onRemoveOriginal(file.attachmentId)}
          />
        </li>
      ))}
      {uploads.map((chip) => (
        <li key={chip.key} className="max-w-full">
          <AttachmentChip
            filename={chip.filename}
            size={chip.size}
            status={chip.status}
            progress={chip.progress}
            error={chip.error}
            onRemove={locked ? undefined : () => onRemoveUpload(chip.key)}
          />
        </li>
      ))}
    </ul>
  );
