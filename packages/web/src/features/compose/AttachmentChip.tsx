import { AlertCircle, Loader2, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSize } from "../../components/attachmentDisplay";

interface Props {
  filename: string;
  size: number;
  /** Uploading shows its progress, failed says why, ready is a plain file. */
  status: "uploading" | "ready" | "failed";
  /** 0–1 while uploading. */
  progress?: number;
  error?: string | null;
  /** Absent while the window cannot change (sending, sent). */
  onRemove?: () => void;
}

/**
 * One file on the window, between the body and the AI strip: a pill with the
 * name and size, a spinner and percentage while it uploads, and — when the
 * server refused it — the reason in the error colours on the chip itself, so
 * one bad file never hides behind a banner or blocks the others.
 */
export const AttachmentChip = ({
  filename,
  size,
  status,
  progress = 0,
  error,
  onRemove,
}: Props) => {
  const failed = status === "failed";
  const detail =
    status === "uploading"
      ? `${formatSize(size)} · ${Math.round(progress * 100)}%`
      : failed
        ? (error ?? "Not attached").replace(/\.$/, "")
        : formatSize(size);
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border pr-1.5 pl-2.5 text-xs",
        failed
          ? "border-gousse-high-border bg-gousse-high-bg text-gousse-error"
          : "border-gousse-border bg-gousse-panel text-gousse-ink",
      )}
    >
      {status === "uploading" ? (
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin text-gousse-muted motion-reduce:animate-none"
          aria-hidden
        />
      ) : failed ? (
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-gousse-muted" aria-hidden />
      )}
      <span className="min-w-0 truncate font-medium" title={filename}>
        {filename}
      </span>
      <span
        className={cn("shrink-0 text-[11px] tabular-nums", failed ? "" : "text-gousse-muted")}
        role={failed ? "alert" : undefined}
      >
        {detail}
      </span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${filename}`}
          onClick={onRemove}
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center rounded-full",
            failed ? "hover:bg-gousse-high/10" : "text-gousse-muted hover:text-gousse-ink",
          )}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
};
