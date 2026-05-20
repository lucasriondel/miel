import { SyncRangeControls } from "./SyncRangeControls";
import { WeekNav } from "./WeekNav";
import type { Week } from "./useWeek";

interface Props {
  week: Week;
  isCurrentWeek: boolean;
  canGoNext: boolean;
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
  canGoNext,
  onPrevWeek,
  onNextWeek,
  onToday,
  accountEmail,
  onSyncResult,
  onSyncError,
}: Props) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-miel-line bg-miel-panel px-6 py-3">
      <WeekNav
        week={week}
        isCurrentWeek={isCurrentWeek}
        canGoNext={canGoNext}
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
