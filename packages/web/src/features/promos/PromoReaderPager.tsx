import { ChevronDown, ChevronUp, X } from "lucide-react";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";

interface Props {
  /** 0-based position of the open promo in the page's reading order. */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * "2 of 5" and the two steps through the page's promos, in the order the page
 * reads them — To review, then Active, then Expired. The ends disable rather
 * than wrap. The close is the reader's own way out; picking another promo is
 * the other.
 */
export const PromoReaderPager = ({ index, total, onPrev, onNext, onClose }: Props) => (
  <div className="ml-auto flex items-center gap-1">
    <span className="pr-1 text-xs text-gousse-muted">
      {index + 1} of {total}
    </span>
    <button
      type="button"
      aria-label="Previous promo"
      onClick={onPrev}
      disabled={index <= 0}
      className={iconButtonClass()}
    >
      <ChevronUp className={iconButtonIconClass()} aria-hidden />
    </button>
    <button
      type="button"
      aria-label="Next promo"
      onClick={onNext}
      disabled={index >= total - 1}
      className={iconButtonClass()}
    >
      <ChevronDown className={iconButtonIconClass()} aria-hidden />
    </button>
    <button type="button" aria-label="Close promo" onClick={onClose} className={iconButtonClass()}>
      <X className={iconButtonIconClass()} aria-hidden />
    </button>
  </div>
);
