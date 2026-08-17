import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query and re-render on match changes. Mirrors the
 * pattern in `usePrefersReducedMotion` (SSR-safe initial read, listener cleanup).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True below Tailwind's `sm` breakpoint (640px) — i.e. the mobile layout. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 639px)");
}
