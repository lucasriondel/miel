import { Clock } from "lucide-react";
import { PopoverPanel } from "../../components/PopoverPanel";
import {
  iconButtonClass,
  iconButtonIconClass,
  iconButtonIconPx,
  type IconButtonSize,
} from "../../components/iconButton";
import { Spinner } from "@/components/ui/spinner";
import { usePopover } from "../../hooks/usePopover";
import { TimePresetItem } from "../time/TimePresetItem";
import { TimePresetMenu } from "../time/TimePresetMenu";
import { presetTimeLabel, snoozePresets } from "../time/timePresets";

interface Props {
  /** When the message comes back, if it is snoozed already; null otherwise. */
  snoozedUntil: string | null;
  size: IconButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** A time was picked: snooze (or re-snooze) until then. */
  onSnooze: (at: Date) => void;
  /** Wake it now. Offered only while the message is snoozed. */
  onUnsnooze: () => void;
}

/**
 * The clock in the reader's toolbar and in a row's actions: a menu of when to
 * bring the message back (`snoozePresets`), or a date and time of the user's
 * own. The design draws the clock and no picker; the menu is the send-options
 * specimen's shape, so the app has one "when?" menu rather than two.
 *
 * On a message already snoozed the same menu moves its wake time, and gains
 * "Unsnooze" at its foot.
 */
export const SnoozeButton = ({
  snoozedUntil,
  size,
  disabled,
  loading,
  onSnooze,
  onUnsnooze,
}: Props) => {
  const { open, toggle, close, ref, panelRef } = usePopover<HTMLDivElement>();
  const now = new Date();
  const label = snoozedUntil
    ? `Snoozed until ${presetTimeLabel(new Date(snoozedUntil), now)}`
    : "Snooze";

  const pick = (at: Date) => {
    close();
    onSnooze(at);
  };

  return (
    <div ref={ref} className="inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        disabled={disabled}
        className={iconButtonClass({ size })}
      >
        {loading ? (
          <Spinner size={iconButtonIconPx(size)} />
        ) : (
          <Clock className={iconButtonIconClass(size)} aria-hidden />
        )}
      </button>
      <PopoverPanel open={open} anchorRef={ref} panelRef={panelRef} align="right">
        {open ? (
          <TimePresetMenu
            ariaLabel="Snooze until"
            presets={snoozePresets(now)}
            onPick={pick}
            customLabel="Pick date & time…"
            submitLabel="Snooze"
            initial={snoozedUntil ? new Date(snoozedUntil) : undefined}
            now={now}
            footer={
              snoozedUntil ? (
                <TimePresetItem
                  label="Unsnooze"
                  onSelect={() => {
                    close();
                    onUnsnooze();
                  }}
                />
              ) : undefined
            }
          />
        ) : null}
      </PopoverPanel>
    </div>
  );
};
