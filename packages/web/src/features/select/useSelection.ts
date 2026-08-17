import { useCallback, useState } from "react";

/**
 * Multi-select state for a list of account-scoped items — inbox messages
 * (keyed by Gmail message id) and the filters page (keyed by Gmail filter id).
 * The item id is opaque to the hook; only the account half of a key is ever
 * interpreted, so one account's selection can never reach another's rows.
 */
export interface SelectionState {
  selectMode: boolean;
  selectedIds: Set<string>;
}

const SEP = "|";

export function selectionKey(accountId: string, itemId: string): string {
  return `${accountId}${SEP}${itemId}`;
}

export function toggleSelection(
  state: SelectionState,
  accountId: string,
  itemId: string,
): SelectionState {
  const key = selectionKey(accountId, itemId);
  const next = new Set(state.selectedIds);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return { ...state, selectedIds: next };
}

export function selectMany(
  state: SelectionState,
  accountId: string,
  itemIds: string[],
): SelectionState {
  const next = new Set(state.selectedIds);
  for (const id of itemIds) {
    next.add(selectionKey(accountId, id));
  }
  return { ...state, selectedIds: next };
}

export function selectionForAccount(state: SelectionState, accountId: string): string[] {
  const prefix = `${accountId}${SEP}`;
  const out: string[] = [];
  for (const key of state.selectedIds) {
    if (key.startsWith(prefix)) out.push(key.slice(prefix.length));
  }
  return out;
}

/**
 * Leaving select mode drops the selection with it: the checkboxes are gone, so
 * a selection kept behind them could only resurface as a surprise the next time
 * select mode is entered.
 */
export function exitedSelection(state: SelectionState): SelectionState {
  return { ...state, selectMode: false, selectedIds: new Set<string>() };
}

export interface UseSelectionApi extends SelectionState {
  enterSelectMode: () => void;
  exitSelectMode: () => void;
  toggle: (accountId: string, itemId: string) => void;
  selectMany: (accountId: string, itemIds: string[]) => void;
  clear: () => void;
  isSelected: (accountId: string, itemId: string) => boolean;
  selectionForAccount: (accountId: string) => string[];
}

export function useSelection(): UseSelectionApi {
  const [state, setState] = useState<SelectionState>({
    selectMode: false,
    selectedIds: new Set<string>(),
  });

  const enterSelectMode = useCallback(() => {
    setState((s) => ({ ...s, selectMode: true }));
  }, []);

  const exitSelectMode = useCallback(() => {
    setState(exitedSelection);
  }, []);

  const toggle = useCallback((accountId: string, itemId: string) => {
    setState((s) => toggleSelection(s, accountId, itemId));
  }, []);

  const selectManyCb = useCallback((accountId: string, itemIds: string[]) => {
    setState((s) => selectMany(s, accountId, itemIds));
  }, []);

  const clear = useCallback(() => {
    setState((s) => ({ ...s, selectedIds: new Set<string>() }));
  }, []);

  const isSelected = useCallback(
    (accountId: string, itemId: string) => state.selectedIds.has(selectionKey(accountId, itemId)),
    [state.selectedIds],
  );

  const selectionForAccountCb = useCallback(
    (accountId: string) => selectionForAccount(state, accountId),
    [state],
  );

  return {
    selectMode: state.selectMode,
    selectedIds: state.selectedIds,
    enterSelectMode,
    exitSelectMode,
    toggle,
    selectMany: selectManyCb,
    clear,
    isSelected,
    selectionForAccount: selectionForAccountCb,
  };
}
