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
 * The delete affordance for one active filter: a trash button that swaps into
 * an inline confirm in place — no modal, no undo toast. Gmail filter deletion
 * is not reversible (a recreated filter gets a new id), so the confirm step is
 * required rather than optional.
 *
 * Presentational only: the row owns the mutation and any error message.
 */
export const FilterRowActions = ({
  confirming,
  pending,
  onRequestConfirm,
  onCancel,
  onConfirm,
}: Props) => {
  const clusterRef = useRef<HTMLDivElement>(null);

  // Arming the row moves focus onto the destructive button, so the confirm is
  // operable from the keyboard without hunting for it. Focus is taken from the
  // cluster rather than a ref on the button: gousse-ui's `Button` types no ref
  // prop.
  useEffect(() => {
    if (confirming) clusterRef.current?.querySelector("button")?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label="Delete filter"
        title="Delete filter"
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
      className="filter-row-actions flex flex-wrap items-center justify-end gap-1.5"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <span className="text-xs text-gousse-muted">Delete this filter?</span>
      <Button variant="danger" onClick={onConfirm} disabled={pending}>
        {pending ? <Spinner /> : null}
        Delete
      </Button>
      <Button variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
};
