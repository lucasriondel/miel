import type { VerificationEntry } from "../codes/collectVerificationCodes";
import { type LedgerItem } from "./ledgerItem";

export interface BuildLedgerInput {
  codes: VerificationEntry[];
}

/** A code whose date cannot be read sorts last. */
const NO_DEADLINE = Number.POSITIVE_INFINITY;

/**
 * Fold the sources into one list of rows.
 *
 * Pure, and given `now` rather than reading the clock, so "2 min" is
 * assertable. The codes keep their own rules upstream — already collected,
 * capped and deduped by `collectVerificationCodes` — and this only decides the
 * shape of a row and where it sits.
 */
export function buildLedger(input: BuildLedgerInput, now: number = Date.now()): LedgerItem[] {
  const items: LedgerItem[] = input.codes.map((entry) => codeItem(entry, now));
  return items.toSorted((a, b) => a.urgency - b.urgency);
}

function codeItem(entry: VerificationEntry, now: number): LedgerItem {
  const at = new Date(entry.internalDate).getTime();
  return {
    id: `code:${entry.accountId}:${entry.gmailMessageId}:${entry.code.value}`,
    // A magic link is its own kind: there is no value worth reading, so the
    // row shows the act instead of a chip.
    kind: entry.code.type === "link" ? "link" : "code",
    issuer: entry.sender,
    context: entry.code.label ?? null,
    when: relativeAge(at, now),
    // A code is worth minutes, so what is left of its life is what is left of
    // the window it was issued in — and the oldest is therefore the most
    // urgent. Negating the age sorts it up, under an ascending "soonest
    // deadline first" rule.
    urgency: Number.isNaN(at) ? NO_DEADLINE : at - now,
    entry,
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * How old a code is, in the shortest form that is still true: "now" under a
 * minute, then minutes, then hours. `collectVerificationCodes` has already
 * dropped anything past a day, so there is no need for a longer form.
 */
function relativeAge(at: number, now: number): string {
  if (Number.isNaN(at)) return "—";
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min`;
  return `${Math.floor(elapsed / HOUR)} h`;
}
