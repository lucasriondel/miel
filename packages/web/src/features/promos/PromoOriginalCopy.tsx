import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { usePromoOriginalMail } from "../../api/queries";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { PromoMonogram } from "./PromoMonogram";
import { PromoOriginalLabel } from "./PromoOriginalLabel";
import { SavedPromoMailBody } from "./SavedPromoMailBody";
import { mailStampLabel } from "./promoDates";

interface Props {
  /** The promo's id — the mail is asked for by it, never by the message's. */
  promoId: string;
  /** Where the mail arrived, for the "to" line. */
  accountEmail: string;
}

/**
 * The mail a saved promo came from (#163), read from the copy the save took.
 *
 * This is the point of having kept it: the save trashed the Gmail original in
 * the same gesture, and Gmail purges its own trash a month later — so what is
 * on screen here is miel's copy, asked for by the promo's id and never by the
 * message's. It still answers long after the mail does not.
 *
 * Read-only, all of it: the extracted fields above are the corrigible part,
 * this is what the shop actually said. The read is made here, by the reader,
 * so a list of twenty promos fetches no mail until one is opened.
 */
export const PromoOriginalCopy = ({ promoId, accountEmail }: Props) => {
  const { data, isLoading, error } = usePromoOriginalMail(promoId);

  return (
    <section aria-label="Original email copy" className="flex flex-col gap-[18px]">
      <PromoOriginalLabel>Original email copy</PromoOriginalLabel>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gousse-muted">
          <Spinner /> Loading the email…
        </div>
      ) : error ? (
        <Empty title="Failed to load the email" description={apiErrorMessage(error)} />
      ) : data ? (
        <>
          <h3 className="text-xl font-bold text-gousse-ink">{data.subject ?? "(no subject)"}</h3>
          <div className="flex min-w-0 items-center gap-3">
            <PromoMonogram name={data.fromName ?? data.fromEmail} size={36} muted />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-sm">
                <span className="font-semibold text-gousse-ink">
                  {data.fromName ?? data.fromEmail ?? "—"}
                </span>
                {data.fromName && data.fromEmail ? (
                  <span className="text-gousse-muted"> &lt;{data.fromEmail}&gt;</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-gousse-muted">to {accountEmail}</p>
            </div>
            <span className="shrink-0 text-xs text-gousse-muted">
              {mailStampLabel(data.internalDate) ?? "—"}
            </span>
          </div>
          <SavedPromoMailBody mail={data} />
        </>
      ) : null}
    </section>
  );
};
