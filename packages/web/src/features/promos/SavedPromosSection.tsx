import type { SavedPromo } from "../../api/types";
import { SavedPromoRow } from "./SavedPromoRow";

interface Props {
  title: string;
  promos: SavedPromo[];
  /**
   * The lapsed half. Greyed rather than dropped: an expired promo is never
   * deleted for the user, because the record of what a shop offered is worth
   * keeping and deletion is always something they chose.
   */
  faded?: boolean;
}

/**
 * One of the page's two sections (#162) — a heading and a table of rows, in the
 * order the server answered them.
 *
 * Nothing at all when the section is empty, so a page whose promos are all
 * still good carries no "Expired" heading with nothing under it.
 *
 * The account is the last column and there is no control above it: the page is
 * global, so every account's codes are on screen at once and there is nothing
 * to pick before anything is visible.
 */
export const SavedPromosSection = ({ title, promos, faded }: Props) => {
  if (promos.length === 0) return null;

  return (
    <section
      aria-label={`${title} promo codes`}
      className={`flex flex-col gap-2${faded ? " opacity-60" : ""}`}
    >
      <h2 className="text-xs font-extrabold uppercase tracking-widest text-gousse-muted">
        {title}
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
              {/* The row's controls (#163, #164) — reading the mail, correcting
                  the guesses, taking the row away. A visible column head over
                  buttons that name themselves would only say it twice. */}
              <th className="px-3 py-2 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {promos.map((promo) => (
              <SavedPromoRow key={promo.id} promo={promo} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
