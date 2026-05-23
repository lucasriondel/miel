import { ViewModeToggle } from "./ViewModeToggle";
import { WeekNav } from "./WeekNav";
import type { ViewMode, Week } from "./useWeek";

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  week: Week;
  isCurrentWeek: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export const InboxNav = ({
  viewMode,
  onViewModeChange,
  week,
  isCurrentWeek,
  canGoNext,
  onPrev,
  onNext,
  onToday,
}: Props) => {
  return (
    <div className="flex items-center gap-3">
      <ViewModeToggle mode={viewMode} onChange={onViewModeChange} />
      {viewMode === "week" ? (
        <WeekNav
          week={week}
          isCurrentWeek={isCurrentWeek}
          canGoNext={canGoNext}
          onPrev={onPrev}
          onNext={onNext}
          onToday={onToday}
        />
      ) : null}
    </div>
  );
};
