import type { GmailFilter } from "../../api/types";
import { selectionKey, type SelectionState } from "../select/useSelection";

/**
 * The id a filter is selected by. Gmail's own id, not the local row id: it is
 * what every filter mutation takes, and it survives a resync that rewrites the
 * row. Selection keys are account-scoped by {@link selectionKey}, so two
 * accounts can hold the same Gmail filter id without colliding.
 */
export function filterSelectionId(filter: GmailFilter): string {
  return filter.gmailFilterId;
}

/** The ids a "select all" over this list would select, in list order. */
export function selectableFilterIds(filters: GmailFilter[]): string[] {
  return filters.map(filterSelectionId);
}

/**
 * The selected rows among `filters`, for one account. Intersected with the list
 * rather than read straight off the selection, so a filter that vanished in a
 * refetch stops counting instead of leaving a phantom in the bar's total.
 *
 * The rows, not just their ids: the merge preview reads each source's criteria
 * and action to show what the merged filter will be.
 */
export function selectedFilters(
  state: SelectionState,
  accountId: string,
  filters: GmailFilter[],
): GmailFilter[] {
  return filters.filter((filter) =>
    state.selectedIds.has(selectionKey(accountId, filterSelectionId(filter))),
  );
}

/** The selected ids among `filters`, for one account. */
export function selectedFilterIds(
  state: SelectionState,
  accountId: string,
  filters: GmailFilter[],
): string[] {
  return selectableFilterIds(selectedFilters(state, accountId, filters));
}

/** The bulk bar's count line. */
export function describeFilterSelection(count: number): string {
  if (count === 0) return "No filters selected";
  return `${count} filter${count === 1 ? "" : "s"} selected`;
}
