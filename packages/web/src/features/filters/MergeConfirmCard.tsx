import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Label } from "../../api/types";
import { FilterActionTags } from "./FilterActionTags";
import { FilterCriteriaTags } from "./FilterCriteriaTags";
import { describeMergeSources, type MergePreview } from "./mergePreview";

interface Props {
  preview: MergePreview;
  labelsByGmailId: Map<string, Label>;
  pending: boolean;
  /** A merge the endpoint refused — the originals are untouched. */
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ColLabel = ({ children }: { children: string }) => (
  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gousse-muted">
    {children}
  </div>
);

/**
 * The step between picking filters and merging them: what the one replacement
 * filter will match and do, shown before anything is created or deleted.
 *
 * The rule is rendered with the list's own `FilterCriteriaTags`/`FilterActionTags`,
 * so the preview reads as the row it is about to become. Its content comes from
 * the same algebra the endpoint runs (`@miel/core/filterMergeSpec`), which also
 * means a merge that can't be represented is refused here — with the reason,
 * and without a request.
 */
export const MergeConfirmCard = ({
  preview,
  labelsByGmailId,
  pending,
  error,
  onConfirm,
  onCancel,
}: Props) => (
  // Escape is a shortcut layered over the buttons inside, which are what the
  // keyboard actually reaches; the handler below sits on the card only to catch
  // the event as it bubbles out of them, so the card is not itself interactive.
  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
  <section
    aria-label="Confirm filter merge"
    className="filter-card border border-gousse-accent/30 px-4 py-3.5"
    onKeyDown={(e) => {
      // Escape backs out, as it does on the per-row delete confirm.
      if (e.key === "Escape" && !pending) {
        e.stopPropagation();
        onCancel();
      }
    }}
  >
    {preview.ok ? (
      <MergeRulePreview preview={preview} labelsByGmailId={labelsByGmailId} />
    ) : (
      <p className="text-sm text-gousse-high">{preview.message}</p>
    )}

    {error ? (
      <p className="mt-2 text-xs text-gousse-high">Could not merge these filters: {error}</p>
    ) : null}

    <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
      {preview.ok ? (
        <Button onClick={onConfirm} disabled={pending}>
          {pending ? <Spinner /> : null}
          Merge
        </Button>
      ) : null}
      <Button variant="ghost" onClick={onCancel} disabled={pending}>
        {preview.ok ? "Cancel" : "Close"}
      </Button>
    </div>
  </section>
);

interface RuleProps {
  preview: Extract<MergePreview, { ok: true }>;
  labelsByGmailId: Map<string, Label>;
}

const MergeRulePreview = ({ preview, labelsByGmailId }: RuleProps) => (
  <>
    <div className="mb-3 flex flex-col gap-0.5">
      <span className="text-sm font-semibold text-gousse-ink">
        {describeMergeSources(preview.sourceCount)}
      </span>
      <span className="text-xs text-gousse-muted">
        The new filter below replaces them. Gmail applies filters only to incoming mail, so
        already-labelled messages keep their labels.
      </span>
    </div>
    <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-4">
      <div className="min-w-0">
        <ColLabel>When</ColLabel>
        <FilterCriteriaTags criteria={preview.criteria} />
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-gousse-muted" aria-hidden />
      <div className="min-w-0">
        <ColLabel>Do</ColLabel>
        <FilterActionTags action={preview.action} labelsByGmailId={labelsByGmailId} />
      </div>
    </div>
  </>
);
