import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether a scroll container is scrolled short of its right edge, so a
 * fade mask can be applied only when content is actually hidden — a permanent
 * mask would dissolve the container's own border when everything fits.
 */
export function useHorizontalOverflow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // 1px slack: fractional layout widths make an exactly-fitting strip
      // report a sub-pixel overflow otherwise.
      const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
      setHasOverflow(remaining > 1);
    };

    measure();
    el.addEventListener("scroll", measure, { passive: true });

    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return { ref, hasOverflow };
}
