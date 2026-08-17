/**
 * Merge algebra for Gmail filters: N filters → one filter.
 *
 * Gmail's criteria fields are single strings, not lists, so "match a@x.com or
 * b@y.com" cannot live in `from` — the merged filter has to carry one `query`
 * criterion holding a search expression. Each source filter is rendered as one
 * search term (whatever fields it actually used, AND-ed together) and the terms
 * are OR-ed inside braces, which is Gmail's grouping syntax:
 *
 *   {from:a@x.com OR subject:(monthly report) OR (has:attachment older_than:1y)}
 *
 * The action is the union of the sources' actions: label ids deduped in
 * first-seen order, plus a forward address if the sources agree on one.
 *
 * Everything here is pure and runs before any Gmail call, so a merge that can't
 * be represented (contradictory label actions, two forward addresses, criteria
 * with no query equivalent) fails while the account is still untouched.
 *
 * This module is a **leaf**: it imports nothing, not even core's own error
 * taxonomy (which would drag `effect` in behind it). That is deliberate — the
 * web app imports it through the `@miel/core/filterMergeSpec` subpath so the
 * merge confirmation can preview exactly what the server will build, rather
 * than reimplementing the algebra and drifting from it. `services/filterMerge`
 * re-exports these under core's tagged-error taxonomy for server callers.
 */

/**
 * The floor on a merge: folding one filter into one filter is not a merge.
 * Shared with the web app so the bulk bar offers the action on exactly the
 * selections the server will accept.
 */
export const MIN_MERGE_SOURCES = 2;

/**
 * A merge the algebra refuses to represent. `services/filterMerge` converts it
 * into the tagged `FilterMergeError`; the web preview reads it directly.
 */
export class FilterMergeRejection extends Error {
  readonly reason: "too_few" | "unknown_filters" | "unmergeable";
  /** The offending source filter ids, when the reason names some. */
  readonly gmailFilterIds?: readonly string[];

  constructor(args: {
    reason: "too_few" | "unknown_filters" | "unmergeable";
    message: string;
    gmailFilterIds?: readonly string[];
  }) {
    super(args.message);
    this.name = "FilterMergeRejection";
    this.reason = args.reason;
    this.gmailFilterIds = args.gmailFilterIds;
  }
}

export interface MergeSourceFilter {
  gmailFilterId: string;
  /** The row's stored Gmail criteria JSON. */
  criteria: Record<string, unknown>;
  /** The row's stored Gmail action JSON. */
  action: Record<string, unknown>;
}

export interface MergedFilterSpec {
  /** The OR expression, to be sent as the new filter's `query` criterion. */
  query: string;
  addLabelIds: string[];
  removeLabelIds: string[];
  forward?: string;
}

/** A token Gmail parses as one term needs no grouping; anything else does. */
const isSingleToken = (v: string) => /^[^\s()"{}]+$/.test(v);

/** True when the value is already one balanced parenthesized group. */
function isGrouped(v: string): boolean {
  if (!v.startsWith("(") || !v.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < v.length; i += 1) {
    if (v[i] === "(") depth += 1;
    else if (v[i] === ")") {
      depth -= 1;
      if (depth === 0) return i === v.length - 1;
    }
  }
  return false;
}

/** Group a criterion value so its words stay bound to their operator. */
function group(value: string): string {
  const v = value.trim();
  if (isGrouped(v) || isSingleToken(v)) return v;
  return `(${v})`;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const s = str(v);
    return s ? [s] : [];
  });
}

/**
 * One source filter's criteria as a single Gmail search term, or `null` when
 * the criteria hold nothing expressible (an empty criteria object).
 *
 * Fields are AND-ed the way Gmail ANDs a filter's own fields, and the result is
 * parenthesized when it has more than one part so OR-ing it stays correct.
 */
export function criteriaToQueryTerm(
  criteria: Record<string, unknown>,
  gmailFilterId?: string,
): string | null {
  const parts: string[] = [];

  for (const field of ["from", "to", "subject"] as const) {
    const value = str(criteria[field]);
    if (value) parts.push(`${field}:${group(value)}`);
  }

  const query = str(criteria.query);
  if (query) parts.push(group(query));

  const negated = str(criteria.negatedQuery);
  if (negated) parts.push(`-${group(negated)}`);

  if (criteria.hasAttachment === true) parts.push("has:attachment");
  if (criteria.excludeChats === true) parts.push("-in:chats");

  const size = typeof criteria.size === "number" ? criteria.size : null;
  if (size !== null && size > 0) {
    const comparison = str(criteria.sizeComparison);
    if (comparison === "larger") parts.push(`larger:${size}`);
    else if (comparison === "smaller") parts.push(`smaller:${size}`);
    else {
      // Dropping it would silently widen what the merged filter matches.
      throw new FilterMergeRejection({
        reason: "unmergeable",
        message: `Filter ${gmailFilterId ?? "?"} matches on message size in a way that can't be expressed as a search query.`,
        gmailFilterIds: gmailFilterId ? [gmailFilterId] : undefined,
      });
    }
  }

  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : `(${parts.join(" ")})`;
}

function mergedQuery(sources: MergeSourceFilter[]): string {
  const terms: string[] = [];
  for (const source of sources) {
    const term = criteriaToQueryTerm(source.criteria, source.gmailFilterId);
    if (!term) {
      throw new FilterMergeRejection({
        reason: "unmergeable",
        message: `Filter ${source.gmailFilterId} has no criteria to merge.`,
        gmailFilterIds: [source.gmailFilterId],
      });
    }
    // Two filters can match the same thing and differ only in their action;
    // OR-ing a term with itself just makes the query noisier.
    if (!terms.includes(term)) terms.push(term);
  }
  return terms.length === 1 ? terms[0]! : `{${terms.join(" OR ")}}`;
}

function mergedAction(
  sources: MergeSourceFilter[],
): Pick<MergedFilterSpec, "addLabelIds" | "removeLabelIds" | "forward"> {
  const addLabelIds: string[] = [];
  const removeLabelIds: string[] = [];
  const forwards = new Map<string, string>();

  for (const source of sources) {
    for (const id of stringList(source.action.addLabelIds)) {
      if (!addLabelIds.includes(id)) addLabelIds.push(id);
    }
    for (const id of stringList(source.action.removeLabelIds)) {
      if (!removeLabelIds.includes(id)) removeLabelIds.push(id);
    }
    const forward = str(source.action.forward);
    if (forward) forwards.set(forward, source.gmailFilterId);
  }

  if (forwards.size > 1) {
    throw new FilterMergeRejection({
      reason: "unmergeable",
      message: `These filters forward to different addresses (${[...forwards.keys()].join(", ")}); a single filter can only forward to one.`,
      gmailFilterIds: [...forwards.values()],
    });
  }

  const conflicting = addLabelIds.filter((id) => removeLabelIds.includes(id));
  if (conflicting.length > 0) {
    throw new FilterMergeRejection({
      reason: "unmergeable",
      message: `These filters disagree about ${conflicting.join(", ")}: one adds the label, another removes it.`,
      gmailFilterIds: sources.map((s) => s.gmailFilterId),
    });
  }

  const forward = [...forwards.keys()][0];
  if (addLabelIds.length === 0 && removeLabelIds.length === 0 && !forward) {
    throw new FilterMergeRejection({
      reason: "unmergeable",
      message: "These filters have no action to merge.",
      gmailFilterIds: sources.map((s) => s.gmailFilterId),
    });
  }

  return { addLabelIds, removeLabelIds, ...(forward ? { forward } : {}) };
}

/**
 * Build the one filter that replaces `sources`. Throws `FilterMergeRejection`
 * when the sources can't be represented as a single filter — see the module
 * comment.
 */
export function buildMergedFilterSpec(sources: MergeSourceFilter[]): MergedFilterSpec {
  if (sources.length < MIN_MERGE_SOURCES) {
    throw new FilterMergeRejection({
      reason: "too_few",
      message: `Merging needs at least ${MIN_MERGE_SOURCES} filters.`,
      gmailFilterIds: sources.map((s) => s.gmailFilterId),
    });
  }
  return { query: mergedQuery(sources), ...mergedAction(sources) };
}
