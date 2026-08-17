import { useMemo } from "react";
import type { Presence } from "./presence";
import { usePresence } from "./usePresence";

/** What a section header shows that the account owns: the number beside the title. */
export interface SectionHeaderItem {
  key: string;
  count: number;
}

const headerKey = (item: SectionHeaderItem) => item.key;

/**
 * Presence for a section's header (#137), which is `usePresence` over a list of
 * at most one — the same merge, the same `exitMs`, the same reduced-motion rule
 * as the rows below it, rather than a second mechanism for the same idea.
 *
 * The key is `(account, section)` and not the count, which is what makes an
 * account switch an exit plus an enter while a count ticking within one account
 * stays a plain text update: the key is unchanged, so the entry is refreshed in
 * place and the node — and its keyframes — survive. The count rides along as
 * the item so a leaving header keeps showing the number it left with instead of
 * hard-cutting to the account being switched to.
 *
 * An empty section has no header at all, so a section that empties out plays the
 * exit and one that fills plays the enter, both for free.
 */
export function useSectionHeaderPresence(
  accountId: string,
  section: string,
  count: number,
): Presence<SectionHeaderItem>[] {
  // Memoised on the primitives it is built from: `usePresence` compares items by
  // identity, so a fresh array on every render would be a fresh merge on every
  // render.
  const items = useMemo(
    () => (count > 0 ? [{ key: `${accountId}:${section}`, count }] : []),
    [accountId, section, count],
  );
  return usePresence(items, headerKey);
}
