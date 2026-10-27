import type { ReactNode } from "react";
import { useMemo } from "react";
import { usePromoSuggestions, type PromoSuggestionsParams } from "../../api/queries";
import type { PromoSuggestion } from "../../api/types";
import { RowPromosContext, rowPromosKey } from "./rowPromosContext";

interface Props extends PromoSuggestionsParams {
  children: ReactNode;
}

/**
 * The promos the sync found, handed to the rows they came from.
 *
 * Mounted by what renders the inbox list, with the account and period that
 * list is showing, so the one request asks for exactly the mail on screen and
 * each row draws its own promos on its second line. Adds no element to the
 * layout.
 */
export const RowPromosHost = ({ children, ...params }: Props) => {
  const promos = usePromoSuggestions(params);

  const byRow = useMemo(() => {
    const map = new Map<string, PromoSuggestion[]>();
    for (const promo of promos.data?.items ?? []) {
      const key = rowPromosKey(promo);
      const list = map.get(key);
      if (list) list.push(promo);
      else map.set(key, [promo]);
    }
    return map;
  }, [promos.data]);

  return <RowPromosContext.Provider value={byRow}>{children}</RowPromosContext.Provider>;
};
