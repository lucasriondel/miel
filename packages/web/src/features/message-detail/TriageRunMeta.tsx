import { format } from "date-fns";
import { cn } from "../../lib/utils";

interface Props {
  createdAt: string;
  model: string | null;
  className?: string;
}

/**
 * When a run happened and what produced it — a muted footer line, `tabular-nums`
 * on the timestamp so a re-render can't jitter its width (DESIGN.md §4).
 */
export const TriageRunMeta = ({ createdAt, model, className }: Props) => (
  <p className={cn("text-xs font-medium text-gousse-muted", className)}>
    <time dateTime={createdAt} className="tabular-nums">
      {format(new Date(createdAt), "PPpp")}
    </time>
    {model ? <span className="opacity-70"> · {model}</span> : null}
  </p>
);
