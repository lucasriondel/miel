import type { ListedMessage } from "../api/types";
import { CategorySelectButton } from "../features/select/CategorySelectButton";
import { SectionActions } from "./SectionActions";
import { useDismissOnOutsideGesture } from "../hooks/useDismissOnOutsideGesture";

interface Props {
  /** The band's name, as the buttons say it: "Promotions", "Primary". */
  name: string;
  accountId: string;
  messages: ListedMessage[];
  selectMode?: boolean;
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
  /** Below `sm`, where there is no hover and the strip is swiped for instead. */
  isMobile: boolean;
  revealed: boolean;
  onClose: () => void;
}

/**
 * What a category band is acted on with: select the whole band, and the three
 * flag actions (mark read / archive / delete) `SectionActions` owns.
 *
 * Desktop is unchanged — a reserved cell in the heading that fades in on hover
 * of the group, so nothing in the heading moves (req. 9).
 *
 * Below `sm` that cell used to be `hidden`, which made the whole band
 * unactionable on a phone: "Delete all in Promotions" existed only under a
 * pointer. The band heading now reveals the same strip the way a message row
 * does — a leftward swipe — rather than growing a third always-on strip inside
 * a 32px-tall heading that already carries a name, a count and a sender run.
 *
 * Mobile keeps the row's two rules for the same reasons. The strip is unmounted
 * until `revealed`, so there are no phantom tap targets sitting invisible over
 * the sender run; and it is an overlay, painted on `--head-surface` (the band's
 * own heading tint, flattened) so the senders underneath it do not read through
 * the icons.
 */
export const CategoryHeaderActions = ({
  name,
  accountId,
  messages,
  selectMode,
  isSelected,
  onToggleCategory,
  isMobile,
  revealed,
  onClose,
}: Props) => {
  useDismissOnOutsideGesture(isMobile && revealed, onClose);

  const buttons = (
    <>
      <CategorySelectButton
        category={name.toLowerCase()}
        accountId={accountId}
        messages={messages}
        isSelected={isSelected}
        onToggleCategory={onToggleCategory}
      />
      {!selectMode && <SectionActions messages={messages} scope={`in ${name}`} />}
    </>
  );

  if (!isMobile) {
    return (
      // A reserved cell, like the row's end (req. 9): the actions fade in on
      // hover of the group rather than being mounted by it, so nothing in the
      // heading moves.
      <div className="category-group-actions hidden shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/category:opacity-100 sm:flex">
        {buttons}
      </div>
    );
  }

  if (!revealed) return null;

  return (
    <div
      // Out of flow, so revealing it cannot make the band heading taller than
      // the 32px the design gives it — which is also why these buttons keep
      // their full 32px target here while the desktop cell's are squeezed to
      // 24px by `.category-group-actions`: nothing they do changes the row.
      //
      // The opaque stop ends where the buttons do (four 32px targets and their
      // three 4px gaps, plus this strip's own `pr-4`), and `pl-12` gives the
      // ramp 3rem to fade the sender run out over — a short ramp reads as a
      // slab sliding in, which is what the row overlay avoids the same way.
      className="absolute inset-y-0 right-0 z-[1] flex animate-slide-in-right items-center gap-1 bg-[linear-gradient(to_left,var(--head-surface)_0,var(--head-surface)_9.75rem,transparent_100%)] pl-12 pr-4"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {buttons}
    </div>
  );
};
