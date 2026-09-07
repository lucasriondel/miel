import type { Label, PromoSuggestion, SuggestedFilter } from "../../api/types";
import type { VerificationEntry } from "../codes/collectVerificationCodes";
import { promoExpiryDate } from "../promos/promoExpiryLabel";
import { type LedgerItem } from "./ledgerItem";

export interface BuildLedgerInput {
  suggestions: SuggestedFilter[];
  labelsByName: Map<string, Label>;
  codes: VerificationEntry[];
  promos: PromoSuggestion[];
}

/**
 * The order the ledger is read in: filters, then codes and links, then promos.
 *
 * Fixed by kind rather than sorted by urgency, which is the trade the design
 * makes on purpose. A promo expiring tomorrow does sit below three codes from
 * this morning — but the kind column is the thing the eye scans, and a list
 * that reorders itself between two renders because a code aged out is a list
 * nobody can point at. Within a kind, urgency decides.
 */
const KIND_ORDER = { filter: 0, code: 1, link: 1, promo: 2 } as const;

/** A filter proposal never lapses, so it sorts last within its own group. */
const NO_DEADLINE = Number.POSITIVE_INFINITY;

/**
 * Fold the three sources into one list of rows.
 *
 * Pure, and given `now` rather than reading the clock, so "2 min" and which
 * promo is next to expire are both assertable. Each source keeps its own rules
 * upstream — the codes are already collected, capped and deduped by
 * `collectVerificationCodes`, the promos are the server's answer, the filter
 * suggestions are the account's pending ones — and this only decides the shape
 * of a row and where it sits.
 */
export function buildLedger(input: BuildLedgerInput, now: number = Date.now()): LedgerItem[] {
  const items: LedgerItem[] = [
    ...input.suggestions.map((s) => filterItem(s, input.labelsByName)),
    ...input.codes.map((entry) => codeItem(entry, now)),
    ...input.promos.map((promo) => promoItem(promo, now)),
  ];

  return items.toSorted((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.urgency - b.urgency);
}

function filterItem(suggestion: SuggestedFilter, labelsByName: Map<string, Label>): LedgerItem {
  return {
    id: `filter:${suggestion.id}`,
    kind: "filter",
    // The pattern is what the rule is about, so it names the row. Falling back
    // through subject to query means a rule with no `from` still says something
    // rather than showing an empty column.
    issuer:
      suggestion.criteriaFrom ?? suggestion.criteriaSubject ?? suggestion.criteriaQuery ?? "—",
    context: suggestion.reasoning,
    when: "proposed",
    urgency: NO_DEADLINE,
    suggestion,
    matchedLabel: labelsByName.get(suggestion.addLabelName.toLowerCase()) ?? null,
  };
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
    // urgent. Negating the age sorts it up, under the same ascending
    // "soonest deadline first" rule the promos use.
    urgency: Number.isNaN(at) ? NO_DEADLINE : at - now,
    entry,
  };
}

function promoItem(promo: PromoSuggestion, now: number): LedgerItem {
  const expiresAt = promo.expiresAt === null ? null : new Date(promo.expiresAt).getTime();
  return {
    id: `promo:${promo.id}`,
    kind: "promo",
    // The model's merchant, or nothing — never the raw address. A promo whose
    // shop neither the model nor the sender named shows an em dash rather than
    // a mail header the user would have to decode.
    issuer: promo.merchant ?? "—",
    context: promo.terms,
    when: promo.expiresAt === null ? "—" : promoExpiryDate(promo.expiresAt),
    // Soonest deadline first; an unstated expiry is not an urgent one, and is
    // not an expired one either, so it sorts last among the promos.
    urgency: expiresAt === null || Number.isNaN(expiresAt) ? NO_DEADLINE : expiresAt - now,
    promo,
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
