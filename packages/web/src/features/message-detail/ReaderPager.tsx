import { ChevronDown, ChevronUp } from "lucide-react";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";

interface Props {
  /** 1-based position of the open message in the list, or 0 when it is not in it. */
  position: number;
  total: number;
  onPrev: (() => void) | undefined;
  onNext: (() => void) | undefined;
}

/**
 * "1 of 3" and the up/down arrows at the reader toolbar's end (UI System ›
 * Reader Toolbar): the open message's place in the list beside it, and the way
 * to the one above or below. An arrow at an end of the list is disabled.
 */
export const ReaderPager = ({ position, total, onPrev, onNext }: Props) => (
  <div className="ml-auto flex shrink-0 items-center gap-0.5">
    {position > 0 ? (
      <span className="mr-1.5 text-xs text-gousse-muted tabular-nums">
        {position} of {total}
      </span>
    ) : null}
    <button
      type="button"
      aria-label="Previous message"
      title="Previous message (K)"
      disabled={!onPrev}
      onClick={onPrev}
      className={iconButtonClass()}
    >
      <ChevronUp className={iconButtonIconClass()} aria-hidden />
    </button>
    <button
      type="button"
      aria-label="Next message"
      title="Next message (J)"
      disabled={!onNext}
      onClick={onNext}
      className={iconButtonClass()}
    >
      <ChevronDown className={iconButtonIconClass()} aria-hidden />
    </button>
  </div>
);
