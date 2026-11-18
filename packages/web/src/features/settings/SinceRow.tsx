import { useState } from "react";
import { Select } from "@/components/ui/select";
import { SettingsRow } from "./SettingsRow";
import { SETTINGS_SELECT } from "./settingsFields";
import { SavedFlash } from "@/components/ui/saved-flash";
import { useUpdateSchedule } from "../../api/mutations";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { SINCE_PRESETS, sincePresetLabel } from "./schedulePresets";

interface Props {
  value: string;
}

/** Look-back window row for automatic sync: a select that autosaves on change. */
export const SinceRow = ({ value }: Props) => {
  const [saved, setSaved] = useState(false);
  const update = useUpdateSchedule();

  const known = SINCE_PRESETS.some((p) => p.value === value);

  return (
    <SettingsRow
      title="Look back"
      description="How far back each automatic run scans for mail."
      control={
        <>
          <Select
            aria-label="Look back window"
            disabled={update.isPending}
            value={value}
            className={`w-[220px] ${SETTINGS_SELECT}`}
            onChange={(e) => {
              setSaved(false);
              update.mutate({ since: e.target.value }, { onSuccess: () => setSaved(true) });
            }}
          >
            {SINCE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            {known ? null : <option value={value}>{sincePresetLabel(value)}</option>}
          </Select>
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
