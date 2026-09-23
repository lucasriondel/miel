// Cap total stagger so long inboxes don't wait seconds for the last row.
const STAGGER_MS = 40;
const MAX_DELAY_MS = 600;

/** The appear delay for the `index`th thing entering the list — a row, or a
 *  category heading entering alongside its first row. */
export const staggerDelayMs = (index: number) => Math.min(index * STAGGER_MS, MAX_DELAY_MS);
