import { Link } from "react-router-dom";
import type { PromoListing } from "../../api/types";
import { PromoOriginalLabel } from "./PromoOriginalLabel";

/**
 * Where a suggestion's mail is: still in the inbox. Nothing of it is kept yet —
 * the copy is written at save time and at no other moment — so the reader says
 * so and links to the message instead of showing a copy that does not exist.
 */
export const PromoSuggestionSource = ({ promo }: { promo: PromoListing }) => (
  <section aria-label="Original email" className="flex flex-col gap-3">
    <PromoOriginalLabel>Original email</PromoOriginalLabel>
    <p className="text-[13px] leading-5 text-gousse-muted">
      {promo.subject ? (
        <>
          <span className="font-medium text-gousse-ink">{promo.subject}</span> is still in{" "}
        </>
      ) : (
        "The email is still in "
      )}
      {promo.accountEmail}. Saving keeps a copy here and moves the original to the trash.
    </p>
    <Link
      to={`/account/${promo.accountId}/messages/${promo.gmailMessageId}`}
      className="self-start text-[13px] font-medium text-gousse-navy hover:underline"
    >
      Open the email
    </Link>
  </section>
);
