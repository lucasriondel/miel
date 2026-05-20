import { Button } from "../../components/Button";
import type { Week } from "./useWeek";

interface Props {
  week: Week;
  isCurrentWeek: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const RANGE_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const YEAR_FMT = new Intl.DateTimeFormat(undefined, { year: "numeric" });

function formatRange(week: Week): string {
  const start = week.start;
  const end = new Date(week.end);
  end.setDate(end.getDate() - 1);
  const sameYear = start.getFullYear() === end.getFullYear();
  const left = RANGE_FMT.format(start);
  const right = RANGE_FMT.format(end);
  const year = YEAR_FMT.format(end);
  return sameYear ? `${left} – ${right}, ${year}` : `${left}, ${YEAR_FMT.format(start)} – ${right}, ${year}`;
}

export const WeekNav = ({ week, isCurrentWeek, canGoNext, onPrev, onNext, onToday }: Props) => {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" onClick={onPrev} aria-label="Previous week">
        ‹
      </Button>
      <div className="min-w-[14rem] text-center text-sm font-medium text-miel-ink">
        {formatRange(week)}
      </div>
      <Button
        variant="ghost"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next week"
      >
        ›
      </Button>
      <Button
        variant="secondary"
        onClick={onToday}
        disabled={isCurrentWeek}
        className="ml-1"
      >
        Today
      </Button>
    </div>
  );
};
