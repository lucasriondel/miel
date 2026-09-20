/**
 * The rule three suites check: chrome may be hover-revealed, but only where
 * hovering is something the user can do.
 *
 * #144 took the hover gate off the section and band actions because it was
 * unconditional: `opacity-0` lifted by `group-hover:` put the buttons in the
 * DOM and out of reach of every touch device, so a category could never be
 * acted on as a whole. The reveal came back behind the `pointer-fine:` variant
 * (`index.css`), which is `(hover: hover) and (pointer: fine)` — anything that
 * fails it never gets the `opacity-0` and keeps the buttons on screen.
 *
 * So the assertion is not "no gate anywhere" any more, which would forbid the
 * refinement along with the bug. It is "no gate that a touch device is subject
 * to": a hiding class is a failure unless every variant in front of it is
 * `pointer-fine`. happy-dom loads no stylesheet, so no render can evaluate the
 * media query — the class list is the mechanism, and the prefix is what says
 * which devices the class reaches.
 */

/** Classes that put chrome out of reach when they apply unconditionally. */
const HIDING_UTILITIES = ["hidden", "invisible", "opacity-0"];

const isHidingUtility = (base: string) =>
  HIDING_UTILITIES.some((u) => base === u || base.startsWith(`${u}/`));

/**
 * The hiding classes in `classes` that are *not* behind `pointer-fine:`.
 *
 * A Tailwind class is `variant:variant:base`, so the base is the last segment
 * and everything before it gates when the base applies. A gate is exempt only
 * when `pointer-fine` is among those variants — one is enough, since a media
 * query cannot be widened by the variants beside it.
 */
export const unconditionalHidingClasses = (classes: string[]): string[] =>
  classes.filter((c) => {
    const parts = c.split(":");
    const base = parts[parts.length - 1]!;
    if (!isHidingUtility(base)) return false;
    return !parts.slice(0, -1).includes("pointer-fine");
  });

/** Every class on `from` and each of its ancestors, nearest first. */
export const classesUpFrom = (from: HTMLElement): string[] => {
  const classes: string[] = [];
  for (let node: HTMLElement | null = from; node; node = node.parentElement) {
    classes.push(...node.className.split(/\s+/).filter(Boolean));
  }
  return classes;
};
