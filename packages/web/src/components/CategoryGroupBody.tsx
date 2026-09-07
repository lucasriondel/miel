import type { ReactNode } from "react";

interface Props {
  collapsed: boolean;
  children: ReactNode;
}

/**
 * The run of rows under a category heading, opening and closing rather than
 * appearing and vanishing (req. 4).
 *
 * The technique is `PresenceRow`'s, for the reason that component has it: a
 * grid track animating between `0fr` and `1fr` collapses to the content's own
 * height without anyone measuring it, so a group of three rows and a group of
 * thirty each close at their own size and no JS reads a `scrollHeight`. The
 * body therefore stays *mounted* while collapsed — unmounting it is what made
 * the close instant — and `overflow-hidden` on the inner cell is what clips
 * the rows as the track shrinks.
 *
 * Two things follow from staying mounted. The rows keep their DOM while hidden,
 * so a collapsed group is still in the tab order unless it is taken out of it
 * — `inert` does that, and matches the heading's `aria-expanded`, so a screen
 * reader and the keyboard agree with what is on screen. And the timing is the
 * exit's (250ms) in both directions rather than the enter's 300ms: opening and
 * closing are the same gesture reversed, and a close that outran its open read
 * as two different controls.
 */
export const CategoryGroupBody = ({ collapsed, children }: Props) => (
  <div
    // `grid-rows-[1fr]` is the open state and the transition is declared on
    // both, so the track animates in whichever direction it is going.
    className={`grid transition-[grid-template-rows] duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${
      collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
    }`}
  >
    <div className="min-h-0 overflow-hidden">
      <div className="category-group-body" inert={collapsed || undefined}>
        {children}
      </div>
    </div>
  </div>
);
