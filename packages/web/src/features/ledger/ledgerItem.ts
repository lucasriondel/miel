import type { Label, PromoSuggestion, SuggestedFilter } from "../../api/types";
import type { VerificationEntry } from "../codes/collectVerificationCodes";

/**
 * The three things the sync finds that can be cleared in a click — a filter it
 * proposes, a verification code it spotted, a promo it extracted — as one row
 * shape (the "actionables ledger").
 *
 * They used to be three components stacked above the message list, each with
 * its own container, its own header and its own idea of what an action looks
 * like: a card with `Create`/`Dismiss` buttons, a scrolling strip of pills, and
 * a scrolling row of cards. Three shapes for one sentence — "the sync found
 * this, deal with it" — and the user paid for all three in vertical space
 * before reaching a single message.
 *
 * The row is the same five columns whatever the kind, which is what makes them
 * scannable as one list: kind, issuer, value, context, deadline, act. What
 * differs per kind is the *value* — a rule needs both its halves shown, a code
 * is a literal to copy, a magic link is an opaque token nobody reads — and
 * which acts apply. Everything else lines up.
 */
export type LedgerKind = "filter" | "code" | "link" | "promo";

interface LedgerItemBase {
  /** Unique within the ledger, and stable across refetches — the React key. */
  id: string;
  kind: LedgerKind;
  /** Who sent it. A merchant, a service, or the domain a filter is about. */
  issuer: string;
  /** The prose after the value: subject, terms, the filter's reasoning. */
  context: string | null;
  /**
   * The right-hand column. An age for a code, an expiry for a promo, the
   * observed period for a filter — already formatted, because what "when"
   * means differs per kind and only the builder knows which.
   */
  when: string;
  /**
   * Sort key: how long the user has to act, soonest first. Codes are minutes,
   * promos are weeks, a filter never lapses — so this is what keeps a code that
   * expires in ten minutes above a promo that runs to Christmas.
   */
  urgency: number;
}

export interface FilterLedgerItem extends LedgerItemBase {
  kind: "filter";
  suggestion: SuggestedFilter;
  /** The existing label of that name, when there is one, for its colour. */
  matchedLabel: Label | null;
}

export interface CodeLedgerItem extends LedgerItemBase {
  kind: "code" | "link";
  entry: VerificationEntry;
}

export interface PromoLedgerItem extends LedgerItemBase {
  kind: "promo";
  promo: PromoSuggestion;
}

export type LedgerItem = FilterLedgerItem | CodeLedgerItem | PromoLedgerItem;

/** How the kind column labels each row. */
export const KIND_LABEL: Record<LedgerKind, string> = {
  filter: "Filter",
  code: "Code",
  link: "Link",
  promo: "Promo",
};
