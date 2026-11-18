import { useRef, type RefObject } from "react";
import { ComposePopover } from "./ComposePopover";
import { CustomTimeForm } from "../time/CustomTimeForm";

interface Props {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onPick: (at: Date) => void;
  onClose: () => void;
}

/**
 * "Schedule send…": the date and time form, floated over the footer it was
 * asked from. The same form the snooze menu swaps in, so a time in the past is
 * refused in words before anything is sent.
 */
export const ScheduleTimePopover = ({ open, anchorRef, onPick, onClose }: Props) => {
  const panel = useRef<HTMLDivElement>(null);
  return (
    <ComposePopover
      open={open}
      anchorRef={anchorRef}
      panelRef={panel}
      onEscape={onClose}
      className="w-[min(18rem,calc(100vw-2rem))]"
    >
      <section aria-label="Schedule send">
        <p className="px-1.5 pt-1 text-xs font-semibold text-gousse-ink">Schedule send</p>
        <CustomTimeForm submitLabel="Schedule send" onSubmit={onPick} onCancel={onClose} />
      </section>
    </ComposePopover>
  );
};
