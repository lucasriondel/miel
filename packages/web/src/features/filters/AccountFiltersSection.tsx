import { useState } from "react";
import type { Account, GmailFilter, Label, SuggestedFilter } from "../../api/types";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { useMergeFilters } from "../../api/filters.hooks";
import { useSelection } from "../select/useSelection";
import { SelectModeButton } from "../select/SelectModeButton";
import { ActiveFiltersSearch } from "./ActiveFiltersSearch";
import { FilterRow } from "./FilterRow";
import { FilterSelectionBar } from "./FilterSelectionBar";
import { MergeConfirmCard } from "./MergeConfirmCard";
import { ProposedFiltersCard } from "./ProposedFiltersCard";
import { searchFilters } from "./filterSearch";
import { selectableFilterIds, selectedFilterIds, selectedFilters } from "./filterSelection";
import { buildMergePreview, describeSurvivingSources } from "./mergePreview";

interface Props {
  account: Account;
  filters: GmailFilter[];
  suggestions: SuggestedFilter[];
  labels: Label[];
}

export const AccountFiltersSection = ({ account, filters, suggestions, labels }: Props) => {
  // Which row is armed for deletion. Held here rather than per row so arming one
  // disarms any other — only one inline confirm is open at a time.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Selection lives with the account's section, which the page remounts per
  // account, so switching accounts drops the selection the same way it drops
  // the search query. Keys are account-scoped besides, so nothing selected here
  // could reach another account's rows.
  const selection = useSelection();
  // The merge confirmation step, and whatever the last attempt had to say.
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [survivingSources, setSurvivingSources] = useState<string[]>([]);
  const mergeFilters = useMergeFilters();

  const labelsByGmailId = new Map(labels.map((l) => [l.gmailLabelId, l]));
  const labelsByName = new Map(labels.map((l) => [l.name.toLowerCase(), l]));

  // Client-side only — the account's filters are all in hand. The proposals
  // card above deliberately ignores the query.
  const visibleFilters = searchFilters(filters, query, labelsByGmailId);

  // Select-all reaches the visible rows only; the count reports every selected
  // filter of this account, including ones the query is currently hiding.
  const selectableIds = selectableFilterIds(visibleFilters);
  // Every selected filter of this account, hidden by the search box or not: the
  // merge folds what the user picked, not what happens to be on screen.
  const selectedRows = selectedFilters(selection, account.id, filters);
  const selectedIds = selectedFilterIds(selection, account.id, filters);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selection.isSelected(account.id, id));

  // Computed on every render of the confirm step rather than frozen when it
  // opened, so a refetch that drops one of the sources restates the merge. The
  // card belongs to select mode: leaving takes the selection with it, and a
  // confirm for a selection that no longer exists is nothing to confirm.
  const mergePreview =
    selection.selectMode && confirmingMerge ? buildMergePreview(selectedRows) : null;

  const closeMergeConfirm = () => {
    setConfirmingMerge(false);
    setMergeError(null);
  };

  // Both ways out of select mode — the header toggle and the bar's Done — take
  // the confirm card with them, so neither can strand it.
  const exitSelectMode = () => {
    closeMergeConfirm();
    selection.exitSelectMode();
  };

  // On success the sources are gone and the replacement is in the refetched
  // list, so there is nothing left to select — leaving select mode also clears
  // the selection. On failure nothing was mutated: the card stays open with the
  // reason and the selection intact, ready for another try.
  const onConfirmMerge = () => {
    setMergeError(null);
    setSurvivingSources([]);
    mergeFilters.mutate(
      { accountId: account.id, gmailFilterIds: selectedIds },
      {
        onSuccess: (result) => {
          // A source Gmail refused to delete still exists and still matches, so
          // say so rather than letting it reappear unexplained in the list.
          setSurvivingSources(result.failedDeletions.map((f) => f.gmailFilterId));
          exitSelectMode();
        },
        onError: (err) => {
          setMergeError(apiErrorMessage(err));
        },
      },
    );
  };

  return (
    <section className="flex flex-col gap-6">
      <ProposedFiltersCard suggestions={suggestions} labelsByName={labelsByName} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gousse-muted">
            <span>Active filters</span>
            <span className="rounded-full bg-gousse-line/50 px-1.5 py-px text-[11px] tabular-nums">
              {visibleFilters.length}
            </span>
          </div>
          {filters.length > 0 ? (
            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
              <ActiveFiltersSearch value={query} onChange={setQuery} />
              <SelectModeButton
                active={selection.selectMode}
                idleTitle="Select filters"
                onClick={selection.selectMode ? exitSelectMode : selection.enterSelectMode}
              />
            </div>
          ) : null}
        </div>

        {selection.selectMode ? (
          <FilterSelectionBar
            count={selectedIds.length}
            totalCount={selectableIds.length}
            allSelected={allSelected}
            onSelectAll={() => selection.selectMany(account.id, selectableIds)}
            onClear={selection.clear}
            onExit={exitSelectMode}
            onMerge={() => {
              setMergeError(null);
              setSurvivingSources([]);
              setConfirmingMerge(true);
            }}
            mergeBusy={confirmingMerge}
          />
        ) : null}

        {mergePreview ? (
          <MergeConfirmCard
            preview={mergePreview}
            labelsByGmailId={labelsByGmailId}
            pending={mergeFilters.isPending}
            error={mergeError}
            onConfirm={onConfirmMerge}
            onCancel={closeMergeConfirm}
          />
        ) : null}

        {survivingSources.length > 0 ? (
          <p className="text-xs text-gousse-high">
            {describeSurvivingSources(survivingSources.length)}
          </p>
        ) : null}

        {filters.length === 0 ? (
          <p className="text-sm text-gousse-muted">No filters yet on {account.email}.</p>
        ) : visibleFilters.length === 0 ? (
          <p className="text-sm text-gousse-muted">
            No active filters match “{query.trim()}”.{" "}
            <button
              type="button"
              onClick={() => setQuery("")}
              className="underline underline-offset-2 hover:text-gousse-ink"
            >
              Clear search
            </button>
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visibleFilters.map((f) => (
              <FilterRow
                key={f.id}
                filter={f}
                labelsByGmailId={labelsByGmailId}
                confirming={confirmingId === f.id}
                onRequestConfirm={() => setConfirmingId(f.id)}
                onCancelConfirm={() => setConfirmingId(null)}
                selectMode={selection.selectMode}
                selected={selection.isSelected(account.id, f.gmailFilterId)}
                onToggleSelect={() => selection.toggle(account.id, f.gmailFilterId)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
