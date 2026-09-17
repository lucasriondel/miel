import { BookmarkCheck } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useSavePromo } from "../../api/mutations";
import type { PromoSuggestion } from "../../api/types";

interface Props {
  /**
   * Only what the save names, rather than a whole suggestion. The two reads
   * behind the two suggestion surfaces differ by a column — the page's rows
   * carry the mailbox they arrived in and the inbox's do not — and neither
   * difference is this button's business.
   */
  promo: Pick<PromoSuggestion, "id" | "accountId" | "gmailMessageId">;
}

/**
 * The one act a suggested promo offers (#161): it saves the promo with a copy
 * of the mail it came from and then trashes the Gmail original — one gesture
 * instead of three, and the ordering between the two writes is the server's
 * rule, not this button's.
 *
 * It is the labelled face of that act, for the Promo Codes page's suggested
 * rows (#154), where a table cell has the width to say both halves out loud.
 * The inbox's own surface spends the same mutation through
 * `features/ledger/PromoLedgerRow`, where an act column one icon wide moves the
 * label into a tooltip instead. A "Save" that silently deleted a message would
 * be the kind of surprise no undo makes up for, so neither face leaves the
 * second half unsaid.
 *
 * No `onError` of its own: the mutation reports a refusal itself, and it is the
 * mutation that puts the row back — this component is unmounted by then,
 * because the row it sits on is the thing that left.
 */
export const SavePromoButton = ({ promo }: Props) => {
  const save = useSavePromo();

  return (
    <button
      type="button"
      disabled={save.isPending}
      onClick={() =>
        save.mutate({
          promoId: promo.id,
          accountId: promo.accountId,
          gmailMessageId: promo.gmailMessageId,
        })
      }
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gousse-line bg-gousse-bg px-2.5 py-1.5 text-xs font-bold text-gousse-ink transition-[background-color,color,transform] hover:bg-gousse-accent/[0.12] hover:text-gousse-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {save.isPending ? (
        <Spinner size={14} />
      ) : (
        <BookmarkCheck className="h-3.5 w-3.5" aria-hidden />
      )}
      Save &amp; delete message
    </button>
  );
};
