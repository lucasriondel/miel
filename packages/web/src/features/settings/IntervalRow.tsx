import { useState } from "react";
import { Segmented } from "./Segmented";
import { SettingsRow } from "./SettingsRow";
import { SavedFlash } from "@/components/ui/saved-flash";
import { useUpdateSchedule } from "../../api/mutations";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { INTERVAL_PRESETS, intervalPresetLabel } from "./schedulePresets";

interface Props {
  value: number;
}

// Short chip labels for the segmented control (the full labels live in the
// dropdown-oriented presets; here space is tight).
const SHORT: Record<number, string> = {
  15: "15 min",
  30: "30 min",
  60: "1 h",
  120: "2 h",
  360: "6 h",
};
const shortLabel = (m: number) => SHORT[m] ?? (m % 60 === 0 ? `${m / 60} h` : `${m} min`);

/** Run-interval row: a segmented picker that autosaves on change. */
export const IntervalRow = ({ value }: Props) => {
  const [saved, setSaved] = useState(false);
  const update = useUpdateSchedule();

  // Surface an out-of-preset value (e.g. set via CLI) as an extra chip so the
  // control reflects reality instead of losing the selection.
  const known = INTERVAL_PRESETS.some((p) => p.minutes === value);
  const options = [
    ...INTERVAL_PRESETS.map((p) => ({ value: p.minutes, label: shortLabel(p.minutes) })),
    ...(known ? [] : [{ value, label: intervalPresetLabel(value) }]),
  ];

  return (
    <SettingsRow
      title="Run every"
      description="How often new mail is fetched and triaged."
      control={
        <>
          <Segmented
            ariaLabel="Run every"
            options={options}
            value={value}
            disabled={update.isPending}
            onChange={(next) => {
              setSaved(false);
              update.mutate({ intervalMinutes: next }, { onSuccess: () => setSaved(true) });
            }}
          />
          <SavedFlash
            saving={update.isPending}
            saved={saved && !update.isError}
            error={update.isError ? apiErrorMessage(update.error) : null}
          />
        </>
      }
    />
  );
};
