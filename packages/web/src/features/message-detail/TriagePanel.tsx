import type { MessageDetail } from "../../api/types";
import { cn } from "../../lib/utils";
import { DisclosureRow } from "./DisclosureRow";
import { priorityBanner } from "./priorityBanner";
import { TriageRunEntry } from "./TriageRunEntry";
import { TriageRunMeta } from "./TriageRunMeta";
import { UntriagedNotice } from "./UntriagedNotice";

interface Props {
  message: MessageDetail;
}

/** Reasoning arrives as prose that is sometimes several lines; the row shows one. */
const firstLine = (reasoning: string) => reasoning.trim().split("\n")[0] ?? "";

/**
 * The triage verdict as a single collapsible row: at rest the priority stays
 * readable and the reasoning costs one line, opening it reveals the full text,
 * the run's provenance and — when there is one — the history behind it.
 */
export const TriagePanel = ({ message }: Props) => {
  const latest = message.triageHistory[0];
  if (!latest) {
    return <UntriagedNotice />;
  }

  const older = message.triageHistory.slice(1);

  const banner = priorityBanner(latest.priority);
  return (
    // The priority banner (UI System › Priority Banner): the verdict and the
    // first line of its reasoning on the level's own tint, right under the
    // title. It is still the disclosure it always was — the whole reasoning,
    // the run's model and time and the earlier runs open beneath it.
    <DisclosureRow
      className={cn("rounded-lg", banner.surface)}
      summaryClassName={cn(
        "min-h-[38px] gap-2 rounded-lg px-3 text-[13px] font-normal hover:bg-transparent",
        banner.text,
        "hover:text-current",
      )}
      label={
        <>
          <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", banner.dot)} />
          <span className="shrink-0 font-semibold">{banner.label} —</span>
          <span className="min-w-0 flex-1 truncate">{firstLine(latest.reasoning)}</span>
        </>
      }
    >
      <div className={cn("border-t px-3 pt-3 pb-3.5", banner.rule)}>
        <p className={cn("text-[13px] leading-relaxed whitespace-pre-line", banner.text)}>
          {latest.reasoning}
        </p>
        <TriageRunMeta createdAt={latest.createdAt} model={latest.model} className="mt-2" />
        {older.length > 0 ? (
          <DisclosureRow
            nested
            className="mt-3"
            summaryClassName="-mx-1 px-1 hover:bg-gousse-panel/60"
            label={`${older.length} earlier triage run${older.length === 1 ? "" : "s"}`}
          >
            <ol className="flex flex-col gap-4 px-1 pt-2 pb-1">
              {older.map((run) => (
                <TriageRunEntry key={run.id} run={run} />
              ))}
            </ol>
          </DisclosureRow>
        ) : null}
      </div>
    </DisclosureRow>
  );
};
