import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  /** Confirm state lives with the list, so only one row can be armed at a time. */
  confirming: boolean;
  pending: boolean;
  onRequestConfirm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The remove affordance for one connected account: a trash button that swaps
 * into an inline confirm in place, mirroring `FilterRowActions`. Removing an
 * account drops every message, label and triage synced for it, so the confirm
 * step is required rather than optional.
 *
 * Presentational only: the row owns the mutation and any error message.
 */
export const AccountRowActions = ({
  confirming,
  pending,
  onRequestConfirm,
  onCancel,
  onConfirm,
}: Props) => {
  const clusterRef = useRef<HTMLDivElement>(null);

  // Arming the row moves focus onto the destructive button, so the confirm is
  // operable from the keyboard. Focus is taken from the cluster rather than a
  // ref on the button: gousse-ui's `Button` types no ref prop.
  useEffect(() => {
    if (confirming) clusterRef.current?.querySelector("button")?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label="Remove account"
        title="Remove account"
        onClick={onRequestConfirm}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gousse-muted transition-[transform,background-color,color] active:scale-[0.96] hover:bg-gousse-high/10 hover:text-gousse-high"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    // Escape dismisses the confirm from anywhere inside the cluster, matching
    // the way a dialog would close. The cluster is a layout box that catches the
    // event on its way out of the buttons, not a control of its own, so giving
    // it a role would announce something that isn't there.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- see above
    <div
      ref={clusterRef}
      className="flex flex-wrap items-center justify-end gap-1.5"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <span className="text-xs text-gousse-muted">Remove this account?</span>
      <Button variant="danger" onClick={onConfirm} disabled={pending}>
        {pending ? <Spinner /> : null}
        Remove
      </Button>
      <Button variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
};
