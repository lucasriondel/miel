import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { AppButton } from "../../components/AppButton";
import { useClearExpiredPromos } from "../../api/mutations";

interface Props {
  count: number;
}

/**
 * Emptying the Expired section in one act.
 *
 * Nothing tidies expired promos away by itself, so this is the user choosing to
 * — for every lapsed row at once instead of one trash icon at a time. It asks
 * first, in place, like `DeletePromoButton`, and for the same sharper reason:
 * each row's copy of the mail is very often the only one left, since the save
 * trashed the Gmail original.
 */
export const ClearExpiredPromosButton = ({ count }: Props) => {
  const [confirming, setConfirming] = useState(false);
  const clusterRef = useRef<HTMLDivElement>(null);
  const clear = useClearExpiredPromos();

  useEffect(() => {
    if (confirming) clusterRef.current?.querySelector("button")?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-gousse-muted transition-colors hover:bg-gousse-fill hover:text-gousse-ink"
      >
        Clear expired
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  }

  return (
    // Escape dismisses the confirm from anywhere inside the cluster, the way a
    // dialog would close. The cluster is a layout box, not a control.
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
      <span className="text-xs text-gousse-muted">
        Delete {count} expired {count === 1 ? "code" : "codes"}?
      </span>
      <AppButton
        tone="danger"
        size="sm"
        onClick={() => clear.mutate(undefined, { onSettled: () => setConfirming(false) })}
        disabled={clear.isPending}
      >
        {clear.isPending ? <Spinner size={14} /> : null}
        Delete
      </AppButton>
      <AppButton
        tone="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={clear.isPending}
      >
        Cancel
      </AppButton>
    </div>
  );
};
