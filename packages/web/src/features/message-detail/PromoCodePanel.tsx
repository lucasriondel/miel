import { Ticket, Sparkles } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useExtractPromos } from "../../api/mutations";
import type { MessageDetail } from "../../api/types";
import { DetailCard } from "./DetailCard";
import { PromoCodeRow } from "./PromoCodeRow";

interface Props {
  message: MessageDetail;
}

/**
 * Asking for this message's promo codes, and reading the answer (#165).
 *
 * The sync extracts promos as it fetches, but only from what it just brought in
 * and only from the mails a content prefilter thought worth a model call. This
 * panel is the other door: the mail that was already in the mailbox, or the one
 * the prefilter passed over, asked about directly.
 *
 * **The trigger and the result share one card**, the way the verification panel
 * beside it keeps its codes with the act they belong to. A button in the top
 * bar would put the question three inches from its answer, and the answer is
 * the whole point — this is not an action on the message, it is a reading of
 * it.
 *
 * Which is also why the panel is always drawn, unlike its neighbour, which
 * appears only once it has found something. A detection panel that hid itself
 * until it had news could never be *asked*, and being askable is the feature.
 *
 * Three states, and the empty one is a real answer rather than a blank: a run
 * that found nothing says so, because "no codes in this mail" and "the button
 * did nothing" are otherwise the same picture. The failures are the mutation's
 * to report — a provider that cannot run raises the toast that sends someone to
 * Settings — so nothing here inspects an error.
 */
export const PromoCodePanel = ({ message }: Props) => {
  const extract = useExtractPromos();

  const handleExtract = () => {
    if (extract.isPending) return;
    extract.mutate({
      accountId: message.accountId,
      gmailMessageId: message.gmailMessageId,
    });
  };

  const result = extract.data;

  return (
    <DetailCard>
      <header className="flex h-10 items-center gap-2 border-b border-gousse-line px-4">
        <Ticket className="h-3.5 w-3.5 shrink-0 text-gousse-muted" aria-hidden />
        <h2 className="text-xs font-semibold text-gousse-ink">Promo Codes</h2>
      </header>

      {result && result.promos.length > 0 ? (
        <div className="divide-y divide-gousse-fill">
          {result.promos.map((promo) => (
            <PromoCodeRow key={promo.id} promo={promo} />
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-gousse-line bg-gousse-hover px-4 py-2.5 first:border-t-0">
        <span className="text-xs text-gousse-muted">
          {/* The empty answer is stated here rather than as a row of its own:
              it is a fact about the run, not a promo. */}
          {result && !result.found
            ? "No promo codes found in this email."
            : "Look for discount codes in this email?"}
        </span>
        <button
          type="button"
          onClick={handleExtract}
          disabled={extract.isPending}
          className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg border border-gousse-border bg-gousse-panel px-3 text-xs font-semibold text-gousse-ink transition-colors hover:border-gousse-border-strong hover:bg-gousse-hover disabled:cursor-progress disabled:opacity-60"
        >
          {extract.isPending ? (
            <Spinner size={14} />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          )}
          {extract.isPending ? "Searching…" : result ? "Search again" : "Find promo codes"}
        </button>
      </div>
    </DetailCard>
  );
};
