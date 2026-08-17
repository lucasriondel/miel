import { useCallback, useState } from "react";

const storageKey = (accountId: string) => `gousse:collapsed-labels:${accountId}`;

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
 * Tracks which nested label paths are collapsed, keyed by full label name and
 * persisted per account in localStorage. Default is expanded (a path is
 * collapsed only if present in the set).
 */
export function useCollapsedLabels(accountId: string | undefined) {
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
