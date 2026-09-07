import { useCallback, useState } from "react";

const storageKey = (accountId: string) => `gousse:collapsed-categories:${accountId}`;

function load(accountId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

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
 */
export function useCollapsedCategories(accountId: string | undefined) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    accountId ? load(accountId) : new Set(),
  );

  const isCollapsed = useCallback((name: string) => collapsed.has(name), [collapsed]);

  const toggle = useCallback(
    (name: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        if (accountId) {
          try {
            localStorage.setItem(storageKey(accountId), JSON.stringify([...next]));
          } catch {
            // ignore quota / disabled storage
          }
        }
        return next;
      });
    },
    [accountId],
  );

  return { isCollapsed, toggle };
}
