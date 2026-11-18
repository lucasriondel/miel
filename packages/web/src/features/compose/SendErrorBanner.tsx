import { AlertCircle } from "lucide-react";
import { ApiError } from "../../api/client";
import { apiErrorMessage } from "../../api/apiErrorMessage";

/**
 * A refused send, above the footer: Gmail's own reason when it gave one, and
 * the two facts the user needs — nothing went, and nothing typed was lost.
 */
export const SendErrorBanner = ({ error }: { error: unknown }) => {
  const reason = apiErrorMessage(error).replace(/\.$/, "");
  const gmail = error instanceof ApiError && error.message === "gmail_error";
  return (
    <p
      role="alert"
      className="flex shrink-0 items-start gap-2 bg-gousse-high-bg px-4 py-2.5 text-xs leading-[18px] text-gousse-high-text"
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {gmail ? `Gmail refused the message: “${reason}”.` : `Couldn’t send — ${reason}.`} Nothing
        was sent; your draft is kept.
      </span>
    </p>
  );
};
