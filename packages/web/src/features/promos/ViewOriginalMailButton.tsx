import { useState } from "react";
import { Mail } from "lucide-react";
import { SavedPromoMailDialog } from "./SavedPromoMailDialog";

interface Props {
  promoId: string;
}

/**
 * The way into the mail a saved promo came from (#163).
 *
 * It owns the open flag, and the dialog behind it owns the read — so a page of
 * twenty saved promos asks the server for no mail at all until someone wants
 * one, which is why the list payload carries no bodies in the first place.
 */
export const ViewOriginalMailButton = ({ promoId }: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-gousse-line bg-gousse-panel px-3 py-1 text-xs font-bold text-gousse-muted transition-[background-color,color,transform] hover:bg-gousse-ink/10 hover:text-gousse-ink active:scale-[0.97]"
      >
        <Mail className="h-3.5 w-3.5" aria-hidden />
        View email
      </button>
      {open ? <SavedPromoMailDialog promoId={promoId} onClose={() => setOpen(false)} /> : null}
    </>
  );
};
