import type { ReactNode } from "react";
import type { Label } from "../../api/types";
import { usePopover } from "../../hooks/usePopover";
import { LabelPickerMenu } from "./LabelPickerMenu";

interface TriggerProps {
  open: boolean;
  toggle: () => void;
}

interface Props {
  accountId: string;
  /** Labels already on what is being labelled; left out where a selection is. */
  applied?: ReadonlySet<string>;
  /** Which edge of the trigger the panel hangs from. */
  align?: "left" | "right";
  onPick: (label: Label) => void;
  /**
   * The button that opens it. A render prop rather than a set of props, because
   * the two faces share nothing about their trigger but the open state it
   * reflects — one is an icon button in a toolbar, the other a badge in a
   * header — and everything else about the picker is the same.
   */
  renderTrigger: (props: TriggerProps) => ReactNode;
}

/**
 * The account's labels, one click from wherever labelling happens (#169).
 *
 * Two faces mount it — the bulk bar's picker (#147) and the message detail's
 * "Add label" (#167) — and since this issue they share the whole of it: the
 * popover, the panel, the filter field, which labels are offered and what is
 * said when there are none. What each keeps is its own trigger and the edge the
 * panel hangs from, the way an attachment's menu is shared between its two
 * presentations (`components/AttachmentMenuContent.tsx`).
 *
 * Click-to-open rather than hover-to-open, so a finger reaches it as readily as
 * a pointer, and click-outside/Escape close it — `usePopover`'s business. The
 * panel is anchored inside the wrapper rather than portalled: neither the bulk
 * bar (sticky) nor the detail header clips, so it has nothing to escape from.
 *
 * Closing is this component's, so a face cannot forget it: a pick closes the
 * panel and then reaches its caller.
 */
export const LabelPicker = ({
  accountId,
  applied,
  align = "left",
  onPick,
  renderTrigger,
}: Props) => {
  const popover = usePopover<HTMLDivElement>();

  const pick = (label: Label) => {
    popover.close();
    onPick(label);
  };

  return (
    <div ref={popover.ref} className="relative">
      {renderTrigger({ open: popover.open, toggle: popover.toggle })}
      {popover.open ? (
        <div
          className={`absolute top-full z-[60] mt-1.5 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1.5 rounded-xl border border-gousse-line bg-gousse-panel p-1.5 shadow-gousse-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <LabelPickerMenu accountId={accountId} applied={applied} onPick={pick} />
        </div>
      ) : null}
    </div>
  );
};
