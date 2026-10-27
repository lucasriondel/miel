import type { LedgerItem } from "./ledgerItem";

/**
 * The header's right-hand count: the total, then a breakdown by kind.
 *
 * Written out rather than shown as three coloured tallies because it is read
 * once, on arrival, to decide whether the ledger is worth working through —
 * "3 items · 3 codes".
 *
 * Links count as codes. The kind column tells them apart where the difference
 * matters — what the row's value is — and a summary that split them would be
 * naming an implementation detail of the detector.
 */
export function ledgerSummary(items: LedgerItem[]): string {
  const codes = items.filter((i) => i.kind === "code" || i.kind === "link").length;

  const parts = [`${items.length} ${plural(items.length, "item")}`];
  if (codes > 0) parts.push(`${codes} ${plural(codes, "code")}`);

  return parts.join(" · ");
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
