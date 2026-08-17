import { ArrowLeft } from "lucide-react";
import { Island } from "../Island";

interface Props {
  onClick: () => void;
}

/**
 * Left island on the message-detail bar, the counterpart to the inbox's
 * `AccountIsland` (#85 §6: new top-bar clusters are `Island`s, not bare
 * buttons). The old detail bar put a naked text link here, which read as a
 * different app once the inbox's islands were beside it in the same route
 * transition.
 *
 * The button fills the island rather than sitting inside it with its own
 * background: an island holding exactly one control has nothing for a second
 * surface to distinguish it from, so the hover wash lands on the pill itself.
 */
export const BackToInboxButton = ({ onClick }: Props) => (
  <Island>
    <button
      type="button"
      onClick={onClick}
      className="-m-0.5 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[13px] font-bold text-gousse-muted transition-[background-color,color,transform] duration-150 active:scale-[0.98] hover:bg-gousse-line/40 hover:text-gousse-ink"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">Back to inbox</span>
    </button>
  </Island>
);
