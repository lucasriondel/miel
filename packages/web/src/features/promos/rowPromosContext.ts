import { createContext, useContext } from "react";
import type { PromoSuggestion } from "../../api/types";

/** One row, named the same way by the host and by the row that asks. */
export const rowPromosKey = (row: { accountId: string; gmailMessageId: string }): string =>
  `${row.accountId}|${row.gmailMessageId}`;

const NONE: readonly PromoSuggestion[] = [];

/**
 * The inbox's promo suggestions, grouped by the mail each was extracted from.
 *
 * Read once for the list rather than once per row: the suggestions are their
 * own query with their own key (#160), deliberately not a field on the listed
 * message, so a row asks the list what it holds for it. `undefined` — no host
 * above — answers nothing, the way a row outside the inbox has no promos to
 * show.
 */
export const RowPromosContext = createContext<ReadonlyMap<string, PromoSuggestion[]> | undefined>(
  undefined,
);

export const useRowPromos = (row: {
  accountId: string;
  gmailMessageId: string;
}): readonly PromoSuggestion[] => useContext(RowPromosContext)?.get(rowPromosKey(row)) ?? NONE;
