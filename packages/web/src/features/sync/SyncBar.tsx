import { SyncRangeControls } from "./SyncRangeControls";
import { WeekNav } from "./WeekNav";
import type { Week } from "./useWeek";

interface Props {
  week: Week;
  isCurrentWeek: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  accountEmail?: string;
  onSyncResult: (info: { fetched: number; triaged: number; errors: string[] }) => void;
  onSyncError: (message: string) => void;
}

export const SyncBar = ({
  week,
  isCurrentWeek,
  onPrevWeek,
  onNextWeek,
  onToday,
  accountEmail,
  onSyncResult,
  onSyncError,
}: Props) => {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-miel-line bg-miel-panel px-3 py-2">
      <WeekNav
        week={week}
        isCurrentWeek={isCurrentWeek}
        onPrev={onPrevWeek}
        onNext={onNextWeek}
        onToday={onToday}
      />
      <SyncRangeControls
        accountEmail={accountEmail}
        onResult={onSyncResult}
        onError={onSyncError}
      />
    </div>
  );
};
