import type { SyncRunResult } from "./types";

/**
 * The line a finished sync leaves (A20): "Sync done · 14 new, 3 codes to
 * review" — the new mail summed over every account's run, and the promo codes
 * found in it, which is what the toast's Review action goes to. With no codes
 * the clause and the action are both left off.
 */
export function syncDoneSummary(runs: readonly Pick<SyncRunResult, "fetched" | "promosFound">[]): {
  message: string;
  codes: number;
} {
  const fetched = runs.reduce((sum, run) => sum + run.fetched, 0);
  const codes = runs.reduce((sum, run) => sum + run.promosFound, 0);
  const tail = codes > 0 ? `, ${codes} ${codes === 1 ? "code" : "codes"} to review` : "";
  return { message: `Sync done · ${fetched} new${tail}`, codes };
}
