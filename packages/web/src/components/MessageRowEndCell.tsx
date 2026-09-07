import type { Priority } from "../api/types";
import { MessageActions } from "./MessageActions";

interface Props {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  isUnread: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  priority: Priority | null;
  relative: string;
  /** Select mode owns the row's right edge, so the actions stand down. */
  showActions: boolean;
}

/**
 * The right end of a row: the date, and the actions that replace it on hover.
 *
 * This is where req. 9 is kept. The two occupy the *same* grid cell — both are
 * `col-start-1 row-start-1` — inside a box whose width is fixed at the actions'
 * width, so revealing them is a cross-fade of opacity and nothing else. The
 * earlier draft hid the date with `display:none`, which reflowed the whole line
 * under the pointer; anything that changes geometry here brings that back.
 *
 * The width is fixed rather than intrinsic for the same reason: the actions are
 * wider than a date like "19d", so a cell sized to its content would jump the
 * moment the pointer arrived.
 *
 * `grid-cols-[5.75rem]` is load-bearing and not a restatement of the width. With
 * no explicit track the single implicit column sizes to its widest child — the
 * actions, at 212px — so it overflowed the 92px box, and `justify-self-end`
 * aligned both children to the end of *that* track rather than the cell. The
 * date was laid out ~120px past the row's right edge, off the side of the
 * viewport, which read as the timestamps having gone missing. Pinning the track
 * to the box's own width is what keeps the two stacked inside it.
 *
 * The actions are positioned out of flow (`absolute inset-y-0 right-0`) rather
 * than stacked in the grid cell, because an in-flow 32px-tall button strip made
 * every row 32px tall whether or not anyone hovered it — while select mode,
 * which stands the actions down, drew the same rows at their text height. Two
 * different row heights for the same content is what that cost; taking the
 * actions out of flow gives every row the shorter one, and the cell is
 * `relative` so they still land on this cell's right edge and centre against
 * its full height.
 */
export const MessageRowEndCell = ({ relative, showActions, ...actions }: Props) => {
  if (!showActions) {
    return (
      <span className="hidden shrink-0 justify-end whitespace-nowrap pr-1 text-xs font-medium text-gousse-muted tabular-nums sm:flex sm:w-[5.75rem]">
        {relative}
      </span>
    );
  }

  return (
    <span className="hidden shrink-0 sm:grid sm:w-[5.75rem] sm:grid-cols-[5.75rem] sm:items-center">
      <span className="col-start-1 row-start-1 justify-self-end whitespace-nowrap pr-1 text-xs font-medium text-gousse-muted tabular-nums transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
        {relative}
      </span>
      {/* `forceVisible` lays the buttons out inline: the reveal is this cell's
          to run, not the shared component's absolute overlay, which sized its
          gradient for a full-width strip that no longer exists.
          The backing is this cell's for the same reason. A long subject runs
          under the actions — the cell is only 5.75rem wide and the text beside
          it is not clipped to make room — so the buttons need an opaque bed or
          the words read straight through them. It is painted in
          `--row-surface`, the flattened colour of whatever the row is actually
          sitting on (index.css publishes one per surface: the page background,
          a category band's tint, that tint plus the row's hover tint). Painting
          `--gousse-bg` here would be a lighter patch on every tinted band, and
          the actions only ever appear on hover, which is the most tinted state
          of all.

          The geometry is why the backing does not hang off this cell. The
          buttons are 32px tall and 212px wide, while the cell is 5.75rem wide
          and only as tall as its date text — so the strip overflows it on both
          axes, and a backing inset to the cell covers neither the icons' full
          height nor the 120px of them that reach left of it.

          It has to reach the row's own edges, too, or the paint stops short
          and the row shows through as a bare strip down the right and a band
          above and below. That is why this cell is *not* `relative`: the
          containing block is `.message-row` itself, so `inset-y-0 right-0`
          resolves against the whole row and needs no measured offsets. The
          cell's `grid` still stacks the date and the actions, which is all the
          `relative` was doing.

          Anchoring to the row rather than cancelling the parent's padding is
          what makes this work on a row with attachments. That second line is a
          sibling of the flex row, not a child, so a backing inset to the flex
          row covers the subject line only and stops dead above the attachment
          pill — and any fixed offset tuned to the 40px single-line row is wrong
          the moment a row is taller. `inset-y-0` has no such number in it.

          The fade is long — `pl-32` gives it 8rem of room and the opaque stop
          ends right where the buttons do — because a short ramp reads as a
          hard-edged slab sliding over the text: the eye catches the boundary,
          which is the thing this backing exists to avoid. Running the gradient
          to zero across the whole approach lets the subject dissolve into the
          row with no seam. */}
      <span className="pointer-events-none absolute inset-y-0 right-0 col-start-1 row-start-1 flex items-center justify-end bg-[linear-gradient(to_left,var(--row-surface)_0,var(--row-surface)_14.25rem,transparent_100%)] pl-32 pr-4 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <MessageActions {...actions} variant="row" forceVisible />
      </span>
    </span>
  );
};
