import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useScheduleSettings, useScheduleStatus } from "../../api/queries";
import { useUpdateSchedule } from "../../api/mutations";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { SavedFlash } from "@/components/ui/saved-flash";
import { IntervalRow } from "./IntervalRow";
import { SinceRow } from "./SinceRow";
import { ScheduleStatusRow } from "./ScheduleStatusRow";
import { SettingsLoadError } from "./SettingsLoadError";
import { SettingsPanel } from "./SettingsPanel";
import { SettingsRow } from "./SettingsRow";

/**
 * Automatic-sync settings as one card: an on/off toggle, then the run interval
 * and look-back window (each autosaving), then a read-only last-run status band.
 * The interval/since rows disable nothing when sync is off — they still persist
 * so the schedule is ready the moment you flip it on.
 */
export const AutomaticSyncManager = () => {
  const { data, isLoading, error } = useScheduleSettings();
  const status = useScheduleStatus();
  const update = useUpdateSchedule();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 text-[13px] text-gousse-muted">
        <Spinner /> Loading schedule…
      </div>
    );
  }

  if (error || !data) {
    return <SettingsLoadError what="the schedule" error={error ?? new Error("No data")} />;
  }

  const toggleError = update.isError && update.variables && "enabled" in update.variables;

  return (
    <SettingsPanel footer={status.data ? <ScheduleStatusRow status={status.data} /> : null}>
      <SettingsRow
        className="py-[15px]"
        title={<span className="text-sm font-semibold">Automatic sync</span>}
        description={
          data.enabled
            ? "Fetching and triaging new mail in the background."
            : "Off — use Sync on the inbox to fetch by hand."
        }
        control={
          <>
            {toggleError ? (
              <SavedFlash saving={false} saved={false} error={apiErrorMessage(update.error)} />
            ) : null}
            <Switch
              checked={data.enabled}
              onCheckedChange={(next) => update.mutate({ enabled: next })}
              disabled={update.isPending}
              aria-label="Automatic sync"
            />
          </>
        }
      />
      <IntervalRow value={data.intervalMinutes} />
      <SinceRow value={data.since} />
    </SettingsPanel>
  );
};
