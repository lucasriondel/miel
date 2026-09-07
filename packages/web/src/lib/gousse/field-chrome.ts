export const FIELD_CHROME =
  "border border-gousse-line bg-gousse-panel px-4 py-1.5 text-sm text-gousse-ink focus:border-gousse-ink focus:outline-hidden";

/**
 * Radius for single-line fields ({@link Input}, {@link Select}). Split out from
 * {@link FIELD_CHROME} so {@link Textarea}, whose multi-line box would look
 * broken as a pill, can share the chrome without inheriting the shape.
 */
export const FIELD_PILL = "rounded-full";

/**
 * Radius for multi-line fields ({@link Textarea}). Generous, but a corner
 * rather than a pill.
 */
export const FIELD_BOX = "rounded-2xl";
