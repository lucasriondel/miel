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
      <header className="flex items-center gap-3 border-b border-gousse-line/60 px-5 py-3.5">
        <CheckCircle className="h-5 w-5 shrink-0 text-gousse-low" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gousse-muted">
          Verification Items
        </h2>
        {detection.description && (
          <span className="truncate text-xs font-medium text-gousse-muted opacity-75">
            {detection.description}
          </span>
        )}
      </header>

      <div className="divide-y divide-gousse-line/60">
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
        <div className="flex items-center justify-between gap-3 border-t border-gousse-line/60 bg-gousse-bg/30 px-5 py-3">
          <span className="text-xs font-medium text-gousse-muted">Handled this confirmation?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-gousse-line/60 bg-gousse-panel px-4 text-xs font-bold text-gousse-muted transition-[background-color,color,transform] hover:bg-gousse-high/10 hover:text-gousse-high active:scale-[0.96] disabled:opacity-50"
          >
            {isDeleting ? <Spinner size={16} /> : <Trash2 className="h-4 w-4" aria-hidden />}
            {isDeleting ? "Deleting…" : "Delete message"}
          </button>
        </div>
      )}
    </DetailCard>
  );
};
