import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import type { ListedMessage } from "../../api/types";
import { collectVerificationCodes } from "../codes/collectVerificationCodes";
import { messageDetailPath } from "../inbox/inboxLocation";
import { buildLedger } from "./buildLedger";
import { CodeLedgerRow } from "./CodeLedgerRow";
import { ledgerSummary } from "./ledgerSummary";

interface Props {
  /** The messages on screen, which the verification codes are detected in. */
  messages: ListedMessage[];
}

/**
 * Everything the sync found that can be cleared in a click, as one list.
 *
 * This replaced the stacked sections above the message list — each cost the
 * inbox a container, a header and a shape of action before the first message. They were never separate features
 * to the user: each is the sync saying "here is something I found, deal with
 * it", and the answer is always one click.
 *
 * Promo codes were rows here too, and moved onto the second line of the message
 * row they were found in: a promo is a fact about one mail, and the row already
 * has a line for those (`MessageRowSecondLine`).
 *
 * The sources keep their own rules and their own endpoints — nothing is merged
 * on the server. Only the presentation is one thing.
 *
 * Renders nothing at all when there is nothing to act on, which is the common
 * case on a quiet inbox. An always-present section that is usually empty is a
 * permanent chrome tax, so there is no empty state and no heading left behind.
 */
export const ActionablesLedger = ({ messages }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Dismissals are this page's, not the server's. A code is browser-side regex
   * over a list the server does not know it produced — there is no dismissed
   * state to write, and inventing one would mean a write for an act that means
   * "not now".
   * So it lives here and lasts as long as the view does.
   */
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  const items = useMemo(
    () =>
      buildLedger({
        codes: collectVerificationCodes(messages),
      }),
    [messages],
  );

  const visible = items.filter((item) => !dismissed.has(item.id));
  if (visible.length === 0) return null;

  const openMessage = (msgAccountId: string, gmailMessageId: string) =>
    navigate(messageDetailPath(msgAccountId, gmailMessageId, location.search));

  return (
    <section
      aria-label="Found in your mail"
      className="overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel shadow-[0_1px_2px_rgb(20_32_46/0.04)]"
    >
      <header className="flex h-8 items-center gap-2.5 bg-gousse-ink/[0.04] pr-3.5 pl-4">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-gousse-ink">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-gousse-muted" aria-hidden />
          Found in your mail
        </span>
        <span className="ml-auto text-xs text-gousse-muted tabular-nums">
          {ledgerSummary(visible)}
        </span>
      </header>

      <ul>
        {visible.map((item) => {
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
