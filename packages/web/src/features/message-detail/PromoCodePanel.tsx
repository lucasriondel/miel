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
      <header className="flex items-center gap-3 border-b border-gousse-line/60 px-5 py-3.5">
        <Ticket className="h-5 w-5 shrink-0 text-gousse-muted" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gousse-muted">
          Promo Codes
        </h2>
      </header>

      {result && result.promos.length > 0 ? (
        <div className="divide-y divide-gousse-line/60">
          {result.promos.map((promo) => (
            <PromoCodeRow key={promo.id} promo={promo} />
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-gousse-line/60 bg-gousse-bg/30 px-5 py-3 first:border-t-0">
        <span className="text-xs font-medium text-gousse-muted">
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
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-gousse-line/60 bg-gousse-panel px-4 text-xs font-bold text-gousse-muted transition-[background-color,color,transform] hover:bg-gousse-ink/10 hover:text-gousse-ink active:scale-[0.96] disabled:opacity-50"
        >
          {extract.isPending ? <Spinner size={16} /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {extract.isPending ? "Searching…" : result ? "Search again" : "Find promo codes"}
        </button>
      </div>
    </DetailCard>
  );
};
