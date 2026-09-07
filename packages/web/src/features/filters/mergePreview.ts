import { MIN_MERGE_SOURCES, buildMergedFilterSpec } from "@miel/core/filterMergeSpec";
import type { GmailFilter } from "../../api/types";

/**
 * Whether a selection of this size is a merge at all. The floor comes from
 * core, so the bulk bar offers the action on exactly the selections the merge
 * endpoint will accept — one fewer and the request is rejected before it runs.
 */
export function canMergeSelection(count: number): boolean {
  return count >= MIN_MERGE_SOURCES;
}

/**
 * What the merge confirmation step shows before anything is committed.
 *
 * The shape is deliberately a filter's own `criteria`/`action`, so the card can
 * render the merged rule through the same `FilterCriteriaTags`/`FilterActionTags`
 * the list uses — the preview looks like the row it is about to become.
 *
 * The algebra comes from `@miel/core/filterMergeSpec`, the very module the merge
 * endpoint runs. That is the point of the shared leaf: a preview computed by a
 * second implementation would eventually promise something the server refuses.
 */
export type MergePreview =
  | {
      ok: true;
      sourceCount: number;
      criteria: GmailFilter["criteria"];
      action: GmailFilter["action"];
    }
  | { ok: false; message: string };

/**
 * Preview merging `filters` into one, or say why it can't be done. Never
 * throws: it runs on every render of the confirm step, where a throw would
 * take the filters page down instead of showing the problem.
 */
export function buildMergePreview(filters: GmailFilter[]): MergePreview {
  try {
    const spec = buildMergedFilterSpec(
      filters.map((f) => ({
        gmailFilterId: f.gmailFilterId,
        criteria: f.criteria,
        action: f.action,
      })),
    );
    return {
      ok: true,
      sourceCount: filters.length,
      criteria: { query: spec.query },
      // Empty lists are omitted rather than sent as `[]`, mirroring the action
      // the service hands Gmail — the preview should not imply an empty change.
      action: {
        ...(spec.addLabelIds.length > 0 ? { addLabelIds: spec.addLabelIds } : {}),
        ...(spec.removeLabelIds.length > 0 ? { removeLabelIds: spec.removeLabelIds } : {}),
        ...(spec.forward ? { forward: spec.forward } : {}),
      },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "These filters can't be merged.",
    };
  }
}

/** The confirmation card's headline. */
export function describeMergeSources(count: number): string {
  return `Merge ${count} filters into one`;
}

/**
 * The notice for a partial merge: the replacement was created, but Gmail
 * refused to delete some of the originals, so they still exist and still match
 * incoming mail. The ids are left out — they're opaque to Gmail's own UI, so
 * the count and the consequence are the actionable part.
 */
export function describeSurvivingSources(count: number): string {
  const subject = count === 1 ? "1 original filter" : `${count} original filters`;
  return `Merged, but Gmail would not delete ${subject}. ${
    count === 1 ? "It is" : "They are"
  } still active alongside the merged one.`;
}
