import { useId } from "react";
import { X } from "lucide-react";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { usePromoOriginalMail } from "../../api/queries";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { Modal } from "../../components/modal/Modal";
import { SavedPromoMailBody } from "./SavedPromoMailBody";

interface Props {
  /** The promo's id — the mail is asked for by it, never by the message's. */
  promoId: string;
  onClose: () => void;
}

/** A field the copy has no value for, in a header that reads as a mail's. */
const UNSTATED = "—";

const receivedOn = (iso: string | null): string =>
  iso === null
    ? UNSTATED
    : new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

const senderLine = (fromName: string | null, fromEmail: string | null): string => {
  if (fromName && fromEmail) return `${fromName} <${fromEmail}>`;
  return fromName ?? fromEmail ?? UNSTATED;
};

/**
 * The mail a saved promo came from (#163), read from the copy the save took.
 *
 * This is the point of having kept it: the save trashed the Gmail original in
 * the same gesture, and Gmail purges its own trash a month later — so what is
 * on screen here is miel's copy, asked for by the promo's id and never by the
 * message's. It still answers long after the mail does not.
 *
 * Read-only, all of it. The five extracted fields on the row are the model's
 * guesses and are the corrigible part; this is what the shop actually said, so
 * the dialog carries one control and it closes the dialog.
 *
 * The read is made here rather than by the page, so a table of twenty rows
 * fetches no mail until someone asks for one.
 */
export const SavedPromoMailDialog = ({ promoId, onClose }: Props) => {
  const titleId = useId();
  const { data, isLoading, error } = usePromoOriginalMail(promoId);

  return (
    <Modal open labelledBy={titleId} onDismiss={onClose} className="max-w-3xl">
      <div className="flex flex-col gap-4">
        <header className="flex items-start gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="text-lg font-extrabold text-gousse-ink">
              {data?.subject ?? (isLoading ? "Loading email…" : "(no subject)")}
            </h2>
            {data ? (
              <>
                <p className="truncate text-sm font-medium text-gousse-muted">
                  {senderLine(data.fromName, data.fromEmail)}
                </p>
                <p className="text-xs font-medium text-gousse-muted">
                  Received {receivedOn(data.internalDate)} · saved copy, kept by miel
                </p>
              </>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gousse-muted transition-[background-color,color,transform] hover:bg-gousse-ink/10 hover:text-gousse-ink active:scale-95"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gousse-muted">
            <Spinner /> Loading the email…
          </div>
        ) : error ? (
          <Empty title="Failed to load the email" description={apiErrorMessage(error)} />
        ) : data ? (
          <SavedPromoMailBody mail={data} />
        ) : null}
      </div>
    </Modal>
  );
};
