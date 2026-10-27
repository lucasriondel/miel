import type { VerificationEntry } from "../codes/collectVerificationCodes";

/**
 * The things the sync finds that can be cleared in a click — a verification
 * code or a magic link it spotted — as one row shape (the "actionables
 * ledger"). Promos were a kind too and now sit on the second line of the
 * message row they came from; AI filter proposals were another, and are gone.
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
 * differs per kind is the *value* — a code is a literal to copy, a magic link
 * is an opaque token nobody reads — and which acts apply. Everything else lines up.
 */
export type LedgerKind = "code" | "link";

interface LedgerItemBase {
  /** Unique within the ledger, and stable across refetches — the React key. */
  id: string;
  kind: LedgerKind;
  /** Who sent it. */
  issuer: string;
  /** The prose after the value: the code's label. */
  context: string | null;
  /** The right-hand column: the code's age, already formatted. */
  when: string;
  /** Sort key: how long the user has to act, soonest first. */
  urgency: number;
}

export interface CodeLedgerItem extends LedgerItemBase {
  kind: "code" | "link";
  entry: VerificationEntry;
}

export type LedgerItem = CodeLedgerItem;

/** How the kind column labels each row. */
export const KIND_LABEL: Record<LedgerKind, string> = {
  code: "Code",
  link: "Link",
};
