import { Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { AppButton } from "../../components/AppButton";
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
  className?: string;
}

/** What the save does, in full — the button's tooltip. */
export const SAVE_PROMO_HINT = "Save the code and move its email to the trash";

/**
 * The one act a suggested promo offers (#161): it saves the promo with a copy
 * of the mail it came from and then trashes the Gmail original — one gesture
 * instead of three, and the ordering between the two writes is the server's
 * rule, not this button's.
 *
 * The redesign labels it "Save", the way the inbox chip
 * (`components/MessageRowPromoChip`) wears one icon: the second half is said in
 * the tooltip rather than on the face. A "Save" that silently deleted a message
 * would be the kind of surprise no undo makes up for, so neither face leaves the
 * second half unsaid — it is just not the headline any more.
 *
 * No `onError` of its own: the mutation reports a refusal itself, and it is the
 * mutation that puts the card back — this component is unmounted by then,
 * because the card it sits on is the thing that left.
 */
export const SavePromoButton = ({ promo, className }: Props) => {
  const save = useSavePromo();

  return (
    <AppButton
      tone="primary"
      size="sm"
      title={SAVE_PROMO_HINT}
      disabled={save.isPending}
      className={className}
      onClick={() =>
        save.mutate({
          promoId: promo.id,
          accountId: promo.accountId,
          gmailMessageId: promo.gmailMessageId,
        })
      }
    >
      {save.isPending ? <Spinner size={14} /> : <Check aria-hidden />}
      Save
    </AppButton>
  );
};
