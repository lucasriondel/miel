import type { ReactNode } from "react";
import { useState } from "react";
import { CustomTimeForm } from "./CustomTimeForm";
import { TimePresetItem } from "./TimePresetItem";
import { presetTimeLabel, type TimePreset } from "./timePresets";

export interface TimePresetMenuProps {
  /** The choices, in order — `snoozePresets(now)` or `schedulePresets(now)`. */
  presets: readonly TimePreset[];
  /** A time was chosen, from a preset or from the custom form. */
  onPick: (at: Date) => void;
  /** The last line, which swaps the list for the form: "Pick date & time…". */
  customLabel: string;
  /** The form's primary button: "Snooze", "Schedule". */
  submitLabel: string;
  /** Where the custom form starts; the next whole hour when omitted. */
  initial?: Date;
  /** What "today" is for the labels and the form's check; the clock when omitted. */
  now?: Date;
  /** Extra lines under the custom one, after a separator — the snooze menu's "Unsnooze". */
  footer?: ReactNode;
  /** Names the menu for assistive tech. */
  ariaLabel?: string;
}

/**
 * A "when?" menu: the presets with the time each resolves to, a separator, and
 * a line that swaps the list for a date and time form in place.
 *
 * Content only — it draws no surface of its own, so it sits inside whatever
 * floats it (`PopoverPanel` for a snooze, the compose window's send menu for a
 * scheduled send). Stable props: `presets`, `onPick`, `customLabel`,
 * `submitLabel`, `initial`; `now`, `footer` and `ariaLabel` are optional extras.
 */
export const TimePresetMenu = ({
  presets,
  onPick,
  customLabel,
  submitLabel,
  initial,
  now,
  footer,
  ariaLabel,
}: TimePresetMenuProps) => {
  const [custom, setCustom] = useState(false);
  const reference = now ?? new Date();

  if (custom) {
    return (
      <CustomTimeForm
        initial={initial}
        submitLabel={submitLabel}
        onSubmit={onPick}
        onCancel={() => setCustom(false)}
        now={now}
      />
    );
  }

  return (
    <div role="menu" aria-label={ariaLabel} className="flex flex-col">
      {presets.map((preset) => (
        <TimePresetItem
          key={preset.id}
          label={preset.label}
          detail={presetTimeLabel(preset.at, reference)}
          onSelect={() => onPick(preset.at)}
        />
      ))}
      <MenuSeparator />
      <TimePresetItem label={customLabel} onSelect={() => setCustom(true)} />
      {footer ? (
        <>
          <MenuSeparator />
          {footer}
        </>
      ) : null}
    </div>
  );
};

const MenuSeparator = () => <hr className="mx-1 my-1 h-px border-0 bg-gousse-line" />;
