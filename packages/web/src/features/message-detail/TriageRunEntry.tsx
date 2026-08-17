import type { MessageDetail } from "../../api/types";
import { PriorityChip } from "./PriorityChip";
import { TriageRunMeta } from "./TriageRunMeta";

interface Props {
  run: MessageDetail["triageHistory"][number];
}

/** One superseded verdict in the earlier-runs list. */
export const TriageRunEntry = ({ run }: Props) => (
  <li className="flex flex-col gap-2 border-l-2 border-gousse-line/60 pl-4">
    <div className="flex flex-wrap items-center gap-2.5">
      <PriorityChip priority={run.priority} />
      <TriageRunMeta createdAt={run.createdAt} model={run.model} />
    </div>
    <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-gousse-ink">
      {run.reasoning}
    </p>
  </li>
);
