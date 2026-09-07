import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, Copy, Mail, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { useSavePromo, useTrashMessage } from "../../api/mutations";
import type { PromoLedgerItem } from "./ledgerItem";
import { LedgerRow } from "./LedgerRow";
import { LedgerIconButton } from "./LedgerIconButton";
import { LedgerValueChip } from "./LedgerValueChip";

interface Props {
  item: PromoLedgerItem;
  onOpenMessage: (accountId: string, gmailMessageId: string) => void;
  onDismiss: (id: string) => void;
}

const COPIED_RESET_MS = 1600;

/**
 * An extracted promo, as one ledger row.
 *
 * The card this replaces gave the discount a headline and the terms their own
 * line to wrap on, because a card is judged on its own. In a ledger the row is
 * read against its neighbours instead, so the code takes the value column like
 * every other literal and the discount leads the context — bolder than the
 * terms that follow it, since the discount is the offer and the terms are the
 * small print.
 *
 * Five acts, the most of any kind. Saving is the one that matters and is the
 * one the card had: it stores the promo with a copy of the mail and then
 * trashes the Gmail original, in that order, which is the server's rule. Here
 * it is a bookmark icon rather than a labelled button, so the ledger's act
 * column stays one width — the label moves into the tooltip, where it still
 * says both halves out loud.
 */
export const PromoLedgerRow = ({ item, onOpenMessage, onDismiss }: Props) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const save = useSavePromo();
  const trash = useTrashMessage();
  const { promo } = item;

  useEffect(() => () => window.clearTimeout(timer.current ?? undefined), []);

  const handleCopy = async () => {
    if (promo.code === null) return;
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(true);
      window.clearTimeout(timer.current ?? undefined);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  // Neither mutation gets an `onError` here: both report a refusal themselves,
  // and both remove this row optimistically, so by the time an answer lands
  // this component is gone.
  const handleSave = () =>
    save.mutate({
      promoId: promo.id,
      accountId: promo.accountId,
      gmailMessageId: promo.gmailMessageId,
    });

  const handleDelete = () =>
    trash.mutate({ accountId: promo.accountId, gmailMessageId: promo.gmailMessageId });

  const busy = save.isPending || trash.isPending;

  return (
    <LedgerRow
      kind="promo"
      issuer={item.issuer}
      when={item.when}
      context={null}
      value={
        <>
          <LedgerValueChip value={promo.code} />
          <span className="hidden min-w-0 truncate text-[13px] text-gousse-muted md:block">
            <span className="font-semibold text-gousse-ink">{promo.discount}</span>
            {item.context ? ` · ${item.context}` : null}
          </span>
        </>
      }
      act={
        <>
          <LedgerIconButton
            label="Save promo & delete message"
            onClick={handleSave}
            disabled={busy}
          >
            {save.isPending ? <Spinner size={16} /> : <Bookmark className="h-4 w-4" aria-hidden />}
          </LedgerIconButton>
          <LedgerIconButton
            label={promo.code === null ? "No code to copy" : copied ? "Copied" : "Copy code"}
            onClick={handleCopy}
            disabled={promo.code === null}
          >
            {copied ? (
              <Check className="h-4 w-4 text-gousse-low" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
          </LedgerIconButton>
          <LedgerIconButton
            label="Open message"
            onClick={() => onOpenMessage(promo.accountId, promo.gmailMessageId)}
          >
            <Mail className="h-4 w-4" aria-hidden />
          </LedgerIconButton>
          <LedgerIconButton label="Delete message" onClick={handleDelete} disabled={busy} danger>
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
