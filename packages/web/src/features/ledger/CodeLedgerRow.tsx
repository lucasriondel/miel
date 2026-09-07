import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Mail, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { useTrashMessage } from "../../api/mutations";
import type { CodeLedgerItem } from "./ledgerItem";
import { LedgerRow } from "./LedgerRow";
import { LedgerIconButton } from "./LedgerIconButton";
import { LedgerValueChip } from "./LedgerValueChip";

interface Props {
  item: CodeLedgerItem;
  /** Opens the mail the code was found in. */
  onOpenMessage: (accountId: string, gmailMessageId: string) => void;
  /** Drops the row without touching the mail. */
  onDismiss: (id: string) => void;
}

const COPIED_RESET_MS = 1600;

/**
 * A verification code or a magic link, as one ledger row.
 *
 * The two are one component because they differ in exactly one column. A code's
 * value is a literal to copy, so it gets the dashed chip and the copy icon. A
 * magic link's "value" is an opaque token nobody reads or copies — showing the
 * URL invites nobody to do anything with it — so the value slot holds the act
 * itself, one button that spends the link, and the copy icon is gone.
 *
 * Delete and dismiss are different acts and sit side by side: the X drops the
 * row and leaves the mail alone, the trash deletes the mail itself. Trashing
 * also removes the row, but by a different route — `useTrashMessage` drops the
 * message from the list optimistically and the codes derive from that list.
 */
export const CodeLedgerRow = ({ item, onOpenMessage, onDismiss }: Props) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const trash = useTrashMessage();
  const { entry } = item;
  const isLink = item.kind === "link";

  useEffect(() => () => window.clearTimeout(timer.current ?? undefined), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entry.code.value);
      setCopied(true);
      window.clearTimeout(timer.current ?? undefined);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  // No `onError` of its own: the trash mutation reports a refusal itself (#145).
  const handleDelete = () =>
    trash.mutate({ accountId: entry.accountId, gmailMessageId: entry.gmailMessageId });

  return (
    <LedgerRow
      kind={item.kind}
      issuer={item.issuer}
      when={item.when}
      context={item.context}
      value={
        isLink ? (
          <button
            type="button"
            onClick={() => window.open(entry.code.value, "_blank", "noreferrer,noopener")}
            className="inline-flex shrink-0 items-center gap-[7px] rounded-lg border border-gousse-line bg-gousse-bg px-[11px] py-1 text-[12.5px] font-semibold text-gousse-ink transition-[background-color,border-color,transform] hover:border-gousse-muted/50 hover:bg-gousse-line/40 active:scale-[0.97]"
          >
            Log in
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : (
          <LedgerValueChip value={entry.code.value} />
        )
      }
      act={
        <>
          {!isLink && (
            <LedgerIconButton label={copied ? "Copied" : "Copy code"} onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-gousse-low" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
            </LedgerIconButton>
          )}
          <LedgerIconButton
            label="Open message"
            onClick={() => onOpenMessage(entry.accountId, entry.gmailMessageId)}
          >
            <Mail className="h-4 w-4" aria-hidden />
          </LedgerIconButton>
          <LedgerIconButton
            label="Delete message"
            onClick={handleDelete}
            disabled={trash.isPending}
            danger
          >
            {trash.isPending ? <Spinner size={16} /> : <Trash2 className="h-4 w-4" aria-hidden />}
          </LedgerIconButton>
          <LedgerIconButton label="Dismiss" onClick={() => onDismiss(item.id)}>
            <X className="h-4 w-4" aria-hidden />
          </LedgerIconButton>
        </>
      }
    />
  );
};
