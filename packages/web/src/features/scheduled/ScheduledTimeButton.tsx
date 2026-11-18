import { PopoverPanel } from "../../components/PopoverPanel";
import { AppButton } from "../../components/AppButton";
import { usePopover } from "../../hooks/usePopover";
import { TimePresetMenu } from "../time/TimePresetMenu";
import type { TimePreset } from "../time/timePresets";

interface Props {
  /** The button's words: "Change time", "Retry". */
  label: string;
  /** The form's primary button inside the menu. */
  submitLabel: string;
  presets: (now: Date) => TimePreset[];
  /** Where the custom form starts — the send's current time. */
  initial?: Date;
  disabled?: boolean;
  onPick: (at: Date) => void;
}

/** A row's text button that opens the shared "when?" menu under it. */
export const ScheduledTimeButton = ({
  label,
  submitLabel,
  presets,
  initial,
  disabled,
  onPick,
}: Props) => {
  const { open, toggle, close, ref, panelRef } = usePopover<HTMLDivElement>();
  const now = new Date();
  return (
    <div ref={ref} className="inline-flex">
      <AppButton
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
      >
        {label}
      </AppButton>
      <PopoverPanel open={open} anchorRef={ref} panelRef={panelRef} align="right">
        {open ? (
          <TimePresetMenu
            ariaLabel={label}
            presets={presets(now)}
            customLabel="Pick date & time…"
            submitLabel={submitLabel}
            initial={initial && initial.getTime() > now.getTime() ? initial : undefined}
            now={now}
            onPick={(at) => {
              close();
              onPick(at);
            }}
          />
        ) : null}
      </PopoverPanel>
    </div>
  );
};
