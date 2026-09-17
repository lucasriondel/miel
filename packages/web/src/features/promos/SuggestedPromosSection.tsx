import type { PromoListing } from "../../api/types";
import { SuggestedPromoRow } from "./SuggestedPromoRow";

interface Props {
  promos: PromoListing[];
}

/**
 * The page's top section (#154): every detection nobody has acted on yet.
 *
 * It exists because of the cap above the inbox. That section shows six cards so
 * a heavy newsletter week cannot push the message list off the screen, and a cap
 * with nowhere to overflow into is a cap that *loses* offers — the detections are
 * answered newest mail first, so a week's seventh distinct code would sit unread
 * until the six ahead of it were saved or lapsed. This is where the rest are, and
 * that is the whole of why a second list of the same rows exists.
 *
 * Uncapped for the same reason, and scoped to no account and no period, because
 * the page is global: a promo code is used at a checkout, so the mailbox is a
 * column on the row and never a gate. Every other rule is the inbox section's,
 * unchanged and decided once on the server — unsaved only, still in the inbox,
 * unexpired, one row per code.
 *
 * Above the saved sections, not below, because it is the only part of the page
 * with something to decide: what is still a suggestion is a question, and what
 * has been kept is a record.
 *
 * Nothing at all when there is nothing suggested, the way the inbox's section
 * renders nothing: an empty heading on the page's steady state is chrome tax.
 */
export const SuggestedPromosSection = ({ promos }: Props) => {
  if (promos.length === 0) return null;

  return (
    <section aria-label="Suggested promo codes" className="flex flex-col gap-2">
      <h2 className="text-xs font-extrabold uppercase tracking-widest text-gousse-muted">
        Suggested
      </h2>
      <div className="overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel shadow-gousse-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gousse-line bg-gousse-bg/40 text-xs uppercase tracking-wide text-gousse-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Merchant</th>
              <th className="px-3 py-2 font-semibold">Offer</th>
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Terms</th>
              <th className="px-3 py-2 font-semibold">Expires</th>
              <th className="px-3 py-2 font-semibold">Account</th>
              {/* The row's one control names itself, and it says both halves of
                  what it does — a column head would only say it a third time. */}
              <th className="px-3 py-2 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {promos.map((promo) => (
              <SuggestedPromoRow key={promo.id} promo={promo} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
