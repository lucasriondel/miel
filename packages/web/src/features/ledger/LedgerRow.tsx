import type { ReactNode } from "react";
import { KIND_LABEL, type LedgerKind } from "./ledgerItem";

interface Props {
  kind: LedgerKind;
  issuer: string;
  /** The thing the user came for — a chip, a rule, a button. Never truncated. */
  value: ReactNode;
  context: string | null;
  when: string;
  /** The icon buttons, in the fixed order the ledger reads them. */
  act: ReactNode;
}

/**
 * The five columns, in the same order on every row whatever the kind. That
 * sameness is the whole point of merging the three sections: the eye learns one
 * layout and then scans down it, instead of re-parsing a card, a pill and a row.
 *
 * Widths are fixed on kind and issuer so the value chips stack into a column
 * rather than stepping in and out with the length of a merchant's name, and the
 * deadline is right-aligned and tabular for the same reason.
 */
export const LedgerRow = ({ kind, issuer, value, context, when, act }: Props) => (
  // A real list item, so the ledger's rows are reachable as a list. Five kinds
  // share one layout and the kind is the only thing that names a row, so the
  // kind and the issuer are what label it.
  <li
    aria-label={`${KIND_LABEL[kind]} — ${issuer}`}
    className="flex items-center gap-3.5 border-b border-gousse-line/45 px-4 py-2 transition-colors last:border-b-0 hover:bg-gousse-line/[0.18] sm:gap-4"
  >
    <span
      className={`w-[74px] shrink-0 text-[10px] font-extrabold uppercase tracking-[0.1em] ${KIND_CLASS[kind]}`}
    >
      {KIND_LABEL[kind]}
    </span>

    <span className="hidden w-[116px] shrink-0 truncate font-semibold sm:block" title={issuer}>
      {issuer}
    </span>

    {/* The value leads, and what follows it is context that may be ellipsed
        away entirely on a narrow viewport. */}
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      {value}
      {context ? (
        <span className="hidden min-w-0 truncate text-[13px] text-gousse-muted md:block">
          {context}
        </span>
      ) : null}
    </span>

    {/* Wide enough for a full "Sep 15, 2026" on one line: a deadline that
        wraps reads as two facts, and the column is the one place every kind
        says the same kind of thing. */}
    <span className="hidden w-[86px] shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-gousse-muted sm:block">
      {when}
    </span>

    <span className="flex shrink-0 items-center gap-0.5">{act}</span>
  </li>
);

/**
 * One colour per kind, and the word carries it rather than a dot beside it: the
 * dot was a second cue for something the colour and the label already said
 * twice over.
 */
const KIND_CLASS: Record<LedgerKind, string> = {
  filter: "text-[rgb(151_117_250)]",
  code: "text-[rgb(77_171_247)]",
  link: "text-[rgb(77_171_247)]",
  promo: "text-gousse-accent",
};
