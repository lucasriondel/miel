import { Sparkles } from "lucide-react";
import type { MessageDetail } from "../../api/types";
import { DetailCard } from "./DetailCard";
import { DisclosureRow } from "./DisclosureRow";
import { PriorityChip } from "./PriorityChip";
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

  return (
    <DetailCard elevation="md">
      <DisclosureRow
        summaryClassName="px-5 gap-3"
        label={
          <>
            <Sparkles className="h-5 w-5 shrink-0 text-gousse-accent" aria-hidden />
            <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gousse-muted">
              AI Triage
            </h2>
            <PriorityChip priority={latest.priority} />
            <span className="min-w-0 flex-1 truncate font-medium text-gousse-muted">
              {firstLine(latest.reasoning)}
            </span>
          </>
        }
      >
        <div className="border-t border-gousse-line/60 px-5 py-4">
          <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-gousse-ink">
            {latest.reasoning}
          </p>
          <TriageRunMeta createdAt={latest.createdAt} model={latest.model} className="mt-3" />
          {older.length > 0 ? (
            <DisclosureRow
              nested
              className="mt-4 border-t border-gousse-line/60 pt-2"
              label={`${older.length} earlier triage run${older.length === 1 ? "" : "s"}`}
            >
              <ol className="flex flex-col gap-4 px-4 pb-1 pt-3">
                {older.map((run) => (
                  <TriageRunEntry key={run.id} run={run} />
                ))}
              </ol>
            </DisclosureRow>
          ) : null}
        </div>
      </DisclosureRow>
    </DetailCard>
  );
};
