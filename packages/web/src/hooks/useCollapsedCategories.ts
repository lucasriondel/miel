import { useCallback, useState } from "react";

const storageKey = (accountId: string) => `gousse:collapsed-categories:${accountId}`;

function load(accountId: string | undefined): Set<string> {
  if (!accountId) return new Set();
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

/** One account's stored preference, read outside the hook — for a group still
 *  on screen from the account being switched away from, whose state the hook
 *  (which follows the account being shown) no longer holds. */
export const isCategoryCollapsedIn = (accountId: string, name: string): boolean =>
  load(accountId).has(name);

/**
 * Which inbox categories are collapsed, keyed by system-label name and persisted
 * per account — `useCollapsedLabels`' shape, for the reason that hook has it: a
 * work mailbox and a personal one have different categories worth hiding, and
 * the preference is the browser's rather than the install's.
 *
 * The key deliberately omits the priority section, so collapsing Promotions
 * collapses it wherever it appears. The alternative — a preference per
 * (section, category) pair — makes the same category answer differently four
 * times over, which is state the user has to hold rather than a setting.
 *
 * Default is expanded: a name is collapsed only if the set names it, so a fresh
 * account shows everything and storage being unavailable degrades to that.
 *
 * Switching accounts is a prop change, not a remount, so the set is held
 * together with the account it was read for and re-read when that changes —
 * during render, so the first frame of the new account already shows its own
 * preference rather than the previous account's.
 */
export function useCollapsedCategories(accountId: string | undefined) {
  const [state, setState] = useState(() => ({ accountId, collapsed: load(accountId) }));
  if (state.accountId !== accountId) setState({ accountId, collapsed: load(accountId) });
  const { collapsed } = state;

  const isCollapsed = useCallback((name: string) => collapsed.has(name), [collapsed]);

  const toggle = useCallback(
    (name: string) => {
      setState((prev) => {
        const next = new Set(prev.collapsed);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        if (accountId) {
          try {
            localStorage.setItem(storageKey(accountId), JSON.stringify([...next]));
          } catch {
            // ignore quota / disabled storage
          }
        }
        return { accountId, collapsed: next };
      });
    },
    [accountId],
  );

  return { isCollapsed, toggle };
}
