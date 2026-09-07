import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useFilters, useLabels, usePromoSuggestions } from "../../api/queries";
import type { ListedMessage } from "../../api/types";
import { collectVerificationCodes } from "../codes/collectVerificationCodes";
import { messageDetailPath } from "../inbox/inboxLocation";
import { buildLedger } from "./buildLedger";
import { CodeLedgerRow } from "./CodeLedgerRow";
import { FilterLedgerRow } from "./FilterLedgerRow";
import { PromoLedgerRow } from "./PromoLedgerRow";
import { ledgerSummary } from "./ledgerSummary";

interface Props {
  accountId: string;
  /** The messages on screen, which the verification codes are detected in. */
  messages: ListedMessage[];
  /** The period the list is showing, so the promos talk about the same mail. */
  internalDateFrom?: string;
  internalDateTo?: string;
}

/**
 * Everything the sync found that can be cleared in a click, as one list.
 *
 * This replaces three stacked sections — the filter proposals card, the
 * verification-code strip and the promo suggestion cards — that between them
 * cost the inbox three containers, three headers and three shapes of action
 * before the first message. They were never three features to the user: each is
 * the sync saying "here is something I found, deal with it", and the answer is
 * always one click.
 *
 * The three sources keep their own rules and their own endpoints — nothing is
 * merged on the server, and the queries, keys and invalidation are exactly what
 * they were. Only the presentation is one thing now.
 *
 * Renders nothing at all when there is nothing to act on, which is the common
 * case on a quiet inbox. An always-present section that is usually empty is a
 * permanent chrome tax, so there is no empty state and no heading left behind.
 */
export const ActionablesLedger = ({
  accountId,
  messages,
  internalDateFrom,
  internalDateTo,
}: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const filters = useFilters(accountId);
  const labels = useLabels(accountId);
  const promos = usePromoSuggestions({ accountId, internalDateFrom, internalDateTo });

  /**
   * Dismissals are this page's, not the server's. A code is browser-side regex
   * over a list the server does not know it produced, and a promo the user
   * waves away is not a *saved* decision — there is no dismissed state on the
   * row, and inventing one would mean a write for an act that means "not now".
   * So it lives here and lasts as long as the view does.
   */
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  const suggestions = useMemo(
    () => (filters.data?.suggestions ?? []).filter((s) => s.accountId === accountId),
    [filters.data, accountId],
  );

  const labelsByName = useMemo(
    () => new Map((labels.data ?? []).map((l) => [l.name.toLowerCase(), l])),
    [labels.data],
  );

  const items = useMemo(
    () =>
      buildLedger({
        suggestions,
        labelsByName,
        codes: collectVerificationCodes(messages),
        promos: promos.data?.items ?? [],
      }),
    [suggestions, labelsByName, messages, promos.data],
  );

  const visible = items.filter((item) => !dismissed.has(item.id));
  if (visible.length === 0) return null;

  const openMessage = (msgAccountId: string, gmailMessageId: string) =>
    navigate(messageDetailPath(msgAccountId, gmailMessageId, location.search));

  return (
    <section
      aria-label="Found in your mail"
      className="overflow-hidden rounded-2xl border border-gousse-line bg-gousse-panel shadow-gousse-sm"
    >
      <header className="flex items-center gap-2.5 border-b border-gousse-line/60 py-2 pl-4 pr-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gousse-accent/[0.12] py-1 pl-2 pr-2.5 text-[11px] font-bold text-gousse-accent">
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
          Found in your mail
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-gousse-muted">
          {ledgerSummary(visible)}
        </span>
      </header>

      <ul>
        {visible.map((item) => {
          if (item.kind === "filter") return <FilterLedgerRow key={item.id} item={item} />;
          if (item.kind === "promo") {
            return (
              <PromoLedgerRow
                key={item.id}
                item={item}
                onOpenMessage={openMessage}
                onDismiss={dismiss}
              />
            );
          }
          return (
            <CodeLedgerRow
              key={item.id}
              item={item}
              onOpenMessage={openMessage}
              onDismiss={dismiss}
            />
          );
        })}
      </ul>
    </section>
  );
};
