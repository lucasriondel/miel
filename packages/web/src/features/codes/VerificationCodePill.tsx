import { useState } from "react";
import { Check, Copy, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { useTrashMessage } from "../../api/mutations";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import type { VerificationEntry } from "./collectVerificationCodes";

interface Props {
  entry: VerificationEntry;
}

const COPIED_RESET_MS = 1600;

/**
 * One code in the strip: sender, the value, then copy (or open, for links) and
 * delete. Deleting trashes the source message — `useTrashMessage` drops it from
 * the message list optimistically, and the strip derives from that same list,
 * so the pill disappears with the row.
 */
export const VerificationCodePill = ({ entry }: Props) => {
  const [copied, setCopied] = useState(false);
  const trash = useTrashMessage();
  const isLink = entry.code.type === "link";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entry.code.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleOpen = () => {
    window.open(entry.code.value, "_blank", "noreferrer,noopener");
  };

  const handleDelete = () => {
    trash.mutate(
      { accountId: entry.accountId, gmailMessageId: entry.gmailMessageId },
      {
        onError: (err) => toast.error(`Could not delete message: ${apiErrorMessage(err)}`),
      },
    );
  };

  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gousse-line bg-gousse-bg py-1 pl-3 pr-1.5">
      <span className="max-w-[7rem] truncate text-[11px] font-bold text-gousse-muted">
        {entry.sender}
      </span>
      {isLink ? (
        <span className="text-sm font-bold text-gousse-ink">Link</span>
      ) : (
        <span className="font-mono text-sm font-bold tracking-widest text-gousse-ink tabular-nums">
          {entry.code.value}
        </span>
      )}
      {isLink && (
        <PillButton label="Open link" onClick={handleOpen}>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </PillButton>
      )}
      <PillButton
        label={copied ? "Copied" : isLink ? "Copy link" : "Copy code"}
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-gousse-low" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </PillButton>
      <PillButton label="Delete message" onClick={handleDelete} disabled={trash.isPending} danger>
        {trash.isPending ? <Spinner size={14} /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
      </PillButton>
    </span>
  );
};

interface PillButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}

const PillButton = ({ label, onClick, disabled, danger, children }: PillButtonProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-gousse-muted transition-[background-color,color,transform] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
      danger
        ? "hover:bg-gousse-high/15 hover:text-gousse-high"
        : "hover:bg-gousse-ink/10 hover:text-gousse-ink"
    }`}
  >
    {children}
  </button>
);
