import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  left: ReactNode;
  center?: ReactNode;
  /** Extra classes applied to the center wrapper (e.g. responsive visibility). */
  centerClassName?: string;
  right: ReactNode;
}

const THRESHOLD = 6;

/** Nearest scrollable ancestor of `el` (the Outlet's overflow-y-auto wrapper). */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Three-island top bar. The shell (background + blur + bottom border) fades to
 * transparent once the content scrolls, leaving the islands floating with a
 * lifted shadow (driven by the `data-scrolled` attribute the islands read).
 */
export const TopBar = ({ left, center, centerClassName = "", right }: Props) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const scrollParent = findScrollParent(barRef.current);
    if (!scrollParent) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      setScrolled(scrollParent.scrollTop > THRESHOLD);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollParent.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={barRef}
      data-scrolled={scrolled}
      className="group/bar sticky top-0 z-50 flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3 sm:px-[18px] md:grid md:grid-cols-[1fr_auto_1fr]"
    >
      {/* Shell surface, faded on scroll via the pseudo-less overlay below. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 border-b border-gousse-line/60 bg-gousse-panel/80 backdrop-blur-[14px] backdrop-saturate-150 transition-opacity duration-300 group-data-[scrolled=true]/bar:opacity-0"
      />
      {/* Row 1 on mobile: account (left) + actions (right). On md+ these become
          the outer two grid columns with the nav centered between them. */}
      <div className="flex items-center gap-3 justify-self-start">{left}</div>
      {center && (
        <div
          className={`order-last w-full flex justify-center md:order-none md:w-auto md:justify-self-center ${centerClassName}`}
        >
          {center}
        </div>
      )}
      <div className="flex items-center gap-2.5 ml-auto md:ml-0 md:justify-self-end">{right}</div>
    </div>
  );
};
