/**
 * The field chrome the redesign draws on every settings control (`miel.figcraft`,
 * Settings): a 32px box with an 8px corner, a hairline border and a 12px medium
 * label — not the registry's pill. Passed as `className` to the vendored
 * `Select` / `Input`, whose `cn` lets these win class for class, so the
 * primitives stay the registry's and only their shape is ours.
 *
 * Whole literals, not assembled fragments: Tailwind scans source text, so a
 * class built at runtime compiles to nothing.
 */
export const SETTINGS_SELECT =
  "h-8 rounded-lg border-gousse-line bg-gousse-panel py-0 text-xs font-medium text-gousse-ink focus:border-gousse-primary focus:ring-[3px] focus:ring-gousse-primary/15 disabled:opacity-60";

export const SETTINGS_INPUT =
  "h-8 rounded-lg border-gousse-line bg-gousse-panel px-3 py-0 text-xs text-gousse-ink placeholder:text-gousse-subtle focus:border-gousse-primary focus:ring-[3px] focus:ring-gousse-primary/15 disabled:opacity-60";
