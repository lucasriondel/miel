import type { Priority } from "../api/types";

/**
 * How many messages a section holds: a quiet number beside the heading, the way
 * the redesign draws every section header (11px, medium, muted). The heading
 * carries the verdict's colour; the count is plain information beside it, the
 * same in every section — which is why both section headers render this.
 */
interface Props {
  category: Priority | "untriaged";
  count: number;
}

export const SectionCount = ({ category, count }: Props) => (
  <span
    data-category={category}
    className="shrink-0 text-[11px] font-medium text-gousse-muted tabular-nums"
  >
    {count}
  </span>
);
