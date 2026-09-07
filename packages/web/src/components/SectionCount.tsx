import type { Priority } from "../api/types";

/**
 * How many messages a section holds, as a tinted chip.
 *
 * It used to be `(n)` in muted grey beside the heading, which made the one fact
 * a section header exists to carry the least visible thing on the line. Raising
 * it in place did not work either: the heading is already bold and coloured
 * (#141), so a second bold coloured word beside it read as two things competing
 * rather than a label and its count. The separation comes from a *shape*
 * instead — which leaves the heading exactly as #141 left it, the colour still
 * on the words rather than on a pill in front of them.
 *
 * The fill is the priority's own token at low alpha with the `-ink` value as
 * text, so nothing new is introduced to recolour later; untriaged takes the
 * neutral line colour, because it is a category without a verdict. Both section
 * headers render this, which is the point — the count is the same fact in both.
 */
const TINT: Record<Priority | "untriaged", string> = {
  high: "bg-gousse-high/15 text-gousse-high-ink",
  medium: "bg-gousse-medium/15 text-gousse-medium-ink",
  low: "bg-gousse-low/15 text-gousse-low-ink",
  untriaged: "bg-gousse-line/60 text-gousse-muted",
};

interface Props {
  category: Priority | "untriaged";
  count: number;
}

export const SectionCount = ({ category, count }: Props) => (
  // Fixed height and a min-width wide enough for two digits, so a count moving
  // from 9 to 10 during a sync changes the number and not the row's geometry.
  <span
    className={`inline-flex h-[22px] min-w-6 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold leading-none tabular-nums ${TINT[category]}`}
  >
    {count}
  </span>
);
