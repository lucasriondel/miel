import { describe, expect, test } from "bun:test";
import type { GmailFilter } from "../../api/types";
import type { SelectionState } from "../select/useSelection";
import {
  describeFilterSelection,
  filterSelectionId,
  selectableFilterIds,
  selectedFilterIds,
  selectedFilters,
} from "./filterSelection";

const makeFilter = (gmailFilterId: string, accountId = "acc-1"): GmailFilter => ({
  id: `row-${gmailFilterId}`,
  accountId,
  gmailFilterId,
  criteria: {},
  action: {},
  syncedAt: "2026-08-01T00:00:00Z",
});

const state = (ids: string[]): SelectionState => ({
  selectMode: true,
  selectedIds: new Set(ids),
});

describe("filterSelectionId", () => {
  test("keys a filter by its Gmail id, not the local row id", () => {
    // Every mutation the merge slice will need takes gmailFilterId; the local
    // `id` is reassigned by a resync of the same filter.
    expect(filterSelectionId(makeFilter("gm-1"))).toBe("gm-1");
  });
});

describe("selectableFilterIds", () => {
  test("returns the Gmail ids of the given filters, in list order", () => {
    expect(selectableFilterIds([makeFilter("gm-2"), makeFilter("gm-1")])).toEqual(["gm-2", "gm-1"]);
  });
});

describe("selectedFilterIds", () => {
  test("returns only the selected filters of that account", () => {
    const filters = [makeFilter("gm-1"), makeFilter("gm-2"), makeFilter("gm-3")];
    const selection = state(["acc-1|gm-1", "acc-1|gm-3"]);
    expect(selectedFilterIds(selection, "acc-1", filters)).toEqual(["gm-1", "gm-3"]);
  });

  test("ignores selections made under another account", () => {
    // Keys carry the account, so a filter selected on acc-2 can never count
    // towards acc-1 even if the two accounts share a Gmail filter id.
    const filters = [makeFilter("gm-1")];
    const selection = state(["acc-2|gm-1"]);
    expect(selectedFilterIds(selection, "acc-1", filters)).toEqual([]);
  });

  test("drops ids no longer in the list, so a deleted filter can't inflate the count", () => {
    const selection = state(["acc-1|gm-1", "acc-1|gone"]);
    expect(selectedFilterIds(selection, "acc-1", [makeFilter("gm-1")])).toEqual(["gm-1"]);
  });
});

describe("describeFilterSelection", () => {
  test("counts in the singular, plural and empty cases", () => {
    expect(describeFilterSelection(0)).toBe("No filters selected");
    expect(describeFilterSelection(1)).toBe("1 filter selected");
    expect(describeFilterSelection(4)).toBe("4 filters selected");
  });
});

describe("selectedFilters", () => {
  test("returns the selected rows themselves, in list order", () => {
    // The merge preview needs each filter's criteria and action, not just its
    // id, so the confirm step can be built without a second lookup.
    const filters = [makeFilter("gm-1"), makeFilter("gm-2"), makeFilter("gm-3")];
    const selection = state(["acc-1|gm-3", "acc-1|gm-1"]);

    expect(selectedFilters(selection, "acc-1", filters)).toEqual([filters[0]!, filters[2]!]);
  });

  test("agrees with selectedFilterIds, which is derived from it", () => {
    const filters = [makeFilter("gm-1"), makeFilter("gm-2")];
    const selection = state(["acc-1|gm-2", "acc-2|gm-1"]);

    expect(selectedFilters(selection, "acc-1", filters).map((f) => f.gmailFilterId)).toEqual(
      selectedFilterIds(selection, "acc-1", filters),
    );
  });
});
