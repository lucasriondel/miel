import type { GmailFilter, Label } from "../../api/types";
import { FilterCriteriaTags } from "./FilterCriteriaTags";
import { FilterActionTags } from "./FilterActionTags";

interface Props {
  filter: GmailFilter;
  labelsByGmailId: Map<string, Label>;
}

export const FilterRow = ({ filter, labelsByGmailId }: Props) => {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 rounded-md border border-miel-line bg-miel-panel px-3 py-2.5">
      <div className="min-w-0">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-miel-muted">
          When
        </div>
        <FilterCriteriaTags criteria={filter.criteria} />
      </div>
      <div className="flex h-full items-center px-1 text-miel-muted">
        <span aria-hidden>→</span>
      </div>
      <div className="min-w-0">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-miel-muted">
          Do
        </div>
        <FilterActionTags
          action={filter.action}
          labelsByGmailId={labelsByGmailId}
        />
      </div>
    </div>
  );
};
