import { useEffect, useRef, useState } from "react";
import { mergePresence, type Presence } from "./presence";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * Keep removed items in the rendered list for `exitMs` so callers can play an
 * exit animation before the node unmounts. Respects `prefers-reduced-motion`
 * by skipping the delay (items disappear immediately).
 */
export function usePresence<T>(
  items: T[],
  getKey: (item: T) => string,
  exitMs = 250,
): Presence<T>[] {
  const getKeyRef = useRef(getKey);
  getKeyRef.current = getKey;

  const reduced = usePrefersReducedMotion();
  const effectiveExitMs = reduced ? 0 : exitMs;

  const [rendered, setRendered] = useState<Presence<T>[]>(() =>
    items.map((item) => ({ item, key: getKey(item), state: "present" as const })),
  );

  useEffect(() => {
    setRendered((current) => {
      const merged = mergePresence(current, items, getKeyRef.current);
      if (sameRendered(current, merged)) return current;
      return merged;
    });
  }, [items]);

  useEffect(() => {
    const leavingKeys = new Set<string>();
    for (const r of rendered) {
      if (r.state === "leaving") leavingKeys.add(r.key);
    }
    if (leavingKeys.size === 0) return;
    const t = setTimeout(() => {
      setRendered((current) =>
        current.filter((r) => !(r.state === "leaving" && leavingKeys.has(r.key))),
      );
    }, effectiveExitMs);
    return () => clearTimeout(t);
  }, [rendered, effectiveExitMs]);

  return rendered;
}

function sameRendered<T>(a: Presence<T>[], b: Presence<T>[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai.key !== bi.key || ai.state !== bi.state || ai.item !== bi.item) {
      return false;
    }
  }
  return true;
}
