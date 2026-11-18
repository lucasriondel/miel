import { Bookmark, Tag } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useSavePromo } from "../api/mutations";
import type { PromoSuggestion } from "../api/types";

interface Props {
  promo: PromoSuggestion;
}

/** Says both halves of the press, since the icon alone can only say one. */
const SAVE_LABEL = "Save promo & delete message";

/**
 * One promo the sync found in this mail, on the row's second line beside the
 * attachments — the code (or, on a row written before #166, the discount) and
 * a single icon to save it.
 *
 * Saving is the one act: it stores the promo with a copy of the mail and then
 * trashes the Gmail original, in that order, which is the server's rule (#161).
 * The mutation takes the row out of the list optimistically and reports a
 * refusal itself, so nothing here waits on it.
 */
export const MessageRowPromoChip = ({ promo }: Props) => {
  const save = useSavePromo();
  const merchant = promo.merchant ? `${promo.merchant} · ` : "";
  const title = `${merchant}${promo.discount}${promo.terms ? ` · ${promo.terms}` : ""}`;

  return (
    <span
      title={title}
      className="inline-flex h-6 max-w-[20rem] items-center gap-1.5 rounded-full border border-gousse-line bg-gousse-panel pr-0.5 pl-2.5 text-xs font-medium text-gousse-ink"
    >
      <Tag className="h-3 w-3 shrink-0 text-gousse-muted" aria-hidden />
      {promo.code !== null && (
        <span className="shrink-0 font-mono font-semibold tracking-wide">{promo.code}</span>
      )}
      <span className="truncate text-[11px] text-gousse-muted">{promo.discount}</span>
      <button
        type="button"
        aria-label={SAVE_LABEL}
        title={SAVE_LABEL}
        disabled={save.isPending}
        onClick={(e) => {
          e.stopPropagation();
          save.mutate({
            promoId: promo.id,
            accountId: promo.accountId,
            gmailMessageId: promo.gmailMessageId,
          });
        }}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gousse-ink transition-colors hover:bg-gousse-fill disabled:cursor-progress disabled:opacity-60"
      >
        {save.isPending ? <Spinner size={12} /> : <Bookmark className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </span>
  );
};
