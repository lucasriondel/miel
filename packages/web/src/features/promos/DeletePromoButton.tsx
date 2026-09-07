import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDeleteSavedPromo } from "../../api/mutations";

interface Props {
  promoId: string;
}

/**
 * Taking a saved promo off the page (#164).
 *
 * Nothing else removes one. An expired promo in particular is kept and greyed
 * rather than tidied away, because the record of what a shop offered is worth
 * having — so every deletion is something the user chose, and this is the
 * choosing.
 *
 * It asks first, in place, the way a filter row does — and here the reason is
 * sharper than "destructive": saving the promo **trashed the Gmail original**,
 * and Gmail purges its own trash a month later, so this row's copy of the mail
 * is very often the only one left anywhere. A misclick beside "View email"
 * would destroy it with nothing to recover it from.
 */
export const DeletePromoButton = ({ promoId }: Props) => {
  const [confirming, setConfirming] = useState(false);
  const clusterRef = useRef<HTMLDivElement>(null);
  const remove = useDeleteSavedPromo();

  // Arming the row moves focus onto the destructive button, so the confirm is
  // operable from the keyboard without hunting for it.
  useEffect(() => {
    if (confirming) clusterRef.current?.querySelector("button")?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label="Delete promo code"
        title="Delete promo code"
        onClick={() => setConfirming(true)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gousse-muted transition-[transform,background-color,color] hover:bg-gousse-high/10 hover:text-gousse-high active:scale-[0.96]"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  }

  return (
    // Escape dismisses the confirm from anywhere inside the cluster, the way a
    // dialog would close. The cluster is a layout box, not a control, so giving
    // it a role would announce something that isn't there.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- see above
    <div
      ref={clusterRef}
      className="flex flex-wrap items-center justify-end gap-1.5"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setConfirming(false);
        }
      }}
    >
      <span className="text-xs text-gousse-muted">Delete this code?</span>
      <Button
        variant="danger"
        onClick={() => remove.mutate({ promoId })}
        disabled={remove.isPending}
      >
        {remove.isPending ? <Spinner /> : null}
        Delete
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={remove.isPending}>
        Cancel
      </Button>
    </div>
  );
};
