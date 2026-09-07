/**
 * The one surface shape the message-detail page's blocks sit on: a `rounded-3xl`
 * panel taking its depth from a shadow ramp, edged with a hairline at reduced
 * alpha rather than a weight-bearing border (DESIGN.md §2, §3).
 *
 * It ships as a class string, not only as a component, because three of the
 * surfaces that need it aren't cards — the plain-text `<pre>`, the body iframe
 * and the dashed empty states can't wrap themselves in a `<section>`.
 *
 * The ramps are spelled out as literals: Tailwind v4 scans source text, so a
 * shadow class assembled from a variable at runtime compiles to no rule at all.
 */
export type SurfaceElevation = "sm" | "md";

const SHADOW: Record<SurfaceElevation, string> = {
  sm: "shadow-gousse-sm",
  md: "shadow-gousse-md",
};

export const detailSurfaceClass = (elevation: SurfaceElevation = "sm") =>
  `rounded-3xl border border-gousse-line/60 bg-gousse-panel ${SHADOW[elevation]}`;
