import type { ReactNode } from "react";
import type { Presence, PresenceState } from "../hooks/presence";
import type { SectionHeaderItem } from "../hooks/useSectionHeaderPresence";

interface Props {
  headers: Presence<SectionHeaderItem>[];
  /** The header line itself, given the count to show and which way it is going. */
  children: (count: number, state: PresenceState) => ReactNode;
}

/**
 * A section header's enter/exit (#137), the header-shaped counterpart to
 * `PresenceRow` — and the reason both sections spell the stack once: a section
 * that laid its two headers out any other way would push its list down for the
 * length of every account switch.
 *
 * The account being left and the one arriving share a single grid cell, so the
 * outgoing header animates out *over* the incoming one. There is no track to
 * collapse, which is the whole of the difference from a row.
 *
 * The keyframes are the rows' own tokens behind the same `motion-safe:` gate;
 * with reduced motion `usePresence` drops the leaving header on the same tick,
 * so nothing lingers un-animated.
 */
export const PresenceHeaders = ({ headers, children }: Props) => {
  if (headers.length === 0) return null;

  return (
    <div className="grid">
      {headers.map(({ item, key, state }) => (
        <div
          key={key}
          className={
            state === "leaving"
              ? "pointer-events-none col-start-1 row-start-1 motion-safe:animate-slide-out"
              : "col-start-1 row-start-1 motion-safe:animate-slide-up"
          }
        >
          {children(item.count, state)}
        </div>
      ))}
    </div>
  );
};
