import type { GmailFilter, Label } from "../../api/types";
import { resolveAddedLabel } from "./resolveAddedLabel";

/**
 * The text one active filter is searchable by: the criteria a user would
 * recognise (from / to / subject / query) plus the *resolved* names of the
 * labels it adds — what the row actually renders, never the raw Gmail ids.
 */
function haystack(filter: GmailFilter, labelsByGmailId: Map<string, Label>): string {
  const parts: string[] = [];
  const { from, to, subject, query } = filter.criteria;
  if (from) parts.push(from);
  if (to) parts.push(to);
  if (subject) parts.push(subject);
  if (query) parts.push(query);
  for (const id of filter.action.addLabelIds ?? []) {
    parts.push(resolveAddedLabel(id, labelsByGmailId).name);
  }
  return parts.join("\n").toLowerCase();
}

/** True when `query` appears, case-insensitively, in the filter's search text. */
export function filterMatchesQuery(
  filter: GmailFilter,
  query: string,
  labelsByGmailId: Map<string, Label>,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return haystack(filter, labelsByGmailId).includes(needle);
}

/**
 * Narrows the active filters to those matching `query`, preserving order.
 * An empty or whitespace-only query is "no filter applied" — everything back.
 */
export function searchFilters(
  filters: GmailFilter[],
  query: string,
  labelsByGmailId: Map<string, Label>,
): GmailFilter[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return filters;
  return filters.filter((f) => haystack(f, labelsByGmailId).includes(needle));
}
