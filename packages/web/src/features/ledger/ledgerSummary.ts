import type { LedgerItem } from "./ledgerItem";

/**
 * The header's right-hand count: the total, then a breakdown by kind.
 *
 * Written out rather than shown as three coloured tallies because it is read
 * once, on arrival, to decide whether the ledger is worth working through —
 * "8 items · 1 filter · 3 codes · 4 promos". Kinds with nothing in them are
 * left out, so a ledger holding only codes says so in three words.
 *
 * Links count as codes. The kind column tells them apart where the difference
 * matters — what the row's value is — and a summary that split them would be
 * naming an implementation detail of the detector.
 */
export function ledgerSummary(items: LedgerItem[]): string {
  const filters = items.filter((i) => i.kind === "filter").length;
  const codes = items.filter((i) => i.kind === "code" || i.kind === "link").length;
  const promos = items.filter((i) => i.kind === "promo").length;

  const parts = [`${items.length} ${plural(items.length, "item")}`];
  if (filters > 0) parts.push(`${filters} ${plural(filters, "filter")}`);
  if (codes > 0) parts.push(`${codes} ${plural(codes, "code")}`);
  if (promos > 0) parts.push(`${promos} ${plural(promos, "promo")}`);

  return parts.join(" · ");
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
