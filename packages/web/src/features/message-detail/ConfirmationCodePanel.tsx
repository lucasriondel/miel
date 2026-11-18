import { useState } from "react";
import { CheckCircle, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { ConfirmationCode, ConfirmationDetection } from "../../utils/detectConfirmation";
import { ConfirmationCodeRow } from "./ConfirmationCodeRow";
import { DetailCard } from "./DetailCard";

interface Props {
  detection: ConfirmationDetection;
  onDelete?: () => void;
  /**
   * Whether the delete is in flight. Owned by the page, which owns the
   * mutation — the panel used to keep its own flag by awaiting `onDelete`,
   * which meant a rejected delete escaped as an unhandled rejection and the
   * flag lied about mutations the page retried.
   */
  isDeleting?: boolean;
}

export const ConfirmationCodePanel = ({ detection, onDelete, isDeleting = false }: Props) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!detection.found || detection.codes.length === 0) {
    return null;
  }

  const handleCopy = async (code: ConfirmationCode, index: number) => {
    try {
      await navigator.clipboard.writeText(code.value);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // `disabled` already blocks the second click; this guards the handler itself
  // so a keyboard-repeat or a programmatic call can't fire a second delete.
  const handleDelete = () => {
    if (!onDelete || isDeleting) return;
    onDelete();
  };

  return (
    <DetailCard elevation="md">
      <header className="flex h-10 items-center gap-2 border-b border-gousse-line px-4">
        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-gousse-low" aria-hidden />
        <h2 className="text-xs font-semibold text-gousse-ink">Verification Items</h2>
        {detection.description && (
          <span className="truncate text-xs text-gousse-muted">{detection.description}</span>
        )}
      </header>

      <div className="divide-y divide-gousse-fill">
        {detection.codes.map((code, index) => (
          <ConfirmationCodeRow
            key={index}
            code={code}
            copied={copiedIndex === index}
            onCopy={() => handleCopy(code, index)}
          />
        ))}
      </div>

      {onDelete && (
        <div className="flex items-center justify-between gap-3 border-t border-gousse-line bg-gousse-hover px-4 py-2.5">
          <span className="text-xs text-gousse-muted">Handled this confirmation?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg border border-gousse-border bg-gousse-panel px-3 text-xs font-semibold text-gousse-ink transition-colors hover:border-gousse-high-border hover:bg-gousse-high-bg hover:text-gousse-high-text disabled:cursor-progress disabled:opacity-60"
          >
            {isDeleting ? <Spinner size={14} /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
            {isDeleting ? "Deleting…" : "Delete message"}
          </button>
        </div>
      )}
    </DetailCard>
  );
};
