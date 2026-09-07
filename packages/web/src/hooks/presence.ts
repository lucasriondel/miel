export type PresenceState = "present" | "leaving";

export interface Presence<T> {
  item: T;
  key: string;
  state: PresenceState;
}

/**
 * Merge a rendered list (which may already contain `leaving` items from a
 * previous exit) with the next set of items. Removed items stay in place and
 * flip to `leaving`; re-added items flip back to `present`; new items append.
 */
export function mergePresence<T>(
  rendered: Presence<T>[],
  next: T[],
  getKey: (item: T) => string,
): Presence<T>[] {
  const nextMap = new Map<string, T>();
  for (const item of next) nextMap.set(getKey(item), item);

  const seen = new Set<string>();
  const result: Presence<T>[] = [];
  for (const r of rendered) {
    const fresh = nextMap.get(r.key);
    if (fresh !== undefined) {
      result.push({ item: fresh, key: r.key, state: "present" });
      seen.add(r.key);
    } else if (r.state === "leaving") {
      result.push(r);
    } else {
      result.push({ item: r.item, key: r.key, state: "leaving" });
    }
  }
  for (const item of next) {
    const k = getKey(item);
    if (!seen.has(k)) result.push({ item, key: k, state: "present" });
  }
  return result;
}
