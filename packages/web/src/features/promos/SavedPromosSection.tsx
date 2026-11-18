import type { ReactNode } from "react";
import type { PromoListing } from "../../api/types";
import { PromoSectionHeader } from "./PromoSectionHeader";
import { SavedPromoRow } from "./SavedPromoRow";

interface Props {
  title: string;
  promos: PromoListing[];
  now: Date;
  selectedId: string | null;
  onSelect: (id: string) => void;
  showAccount: boolean;
  /**
   * The lapsed half. Greyed rather than dropped: an expired promo is never
   * deleted for the user, because the record of what a shop offered is worth
   * keeping and deletion is always something they chose.
   */
  faded?: boolean;
  /** A control at the heading's right edge that acts on the whole section. */
  action?: ReactNode;
}

/**
 * One of the page's two saved sections (#162) — a heading and a card of rows,
 * in the order the server answered them.
 *
 * Nothing at all when the section is empty, so a page whose promos are all
 * still good carries no "Expired" heading with nothing under it.
 */
export const SavedPromosSection = ({
  title,
  promos,
  now,
  selectedId,
  onSelect,
  showAccount,
  faded,
  action,
}: Props) => {
  if (promos.length === 0) return null;

  return (
    <section aria-label={`${title} promo codes`} className="@container flex flex-col gap-2">
      <PromoSectionHeader
        title={title}
        count={promos.length}
        tone={faded ? "muted" : "default"}
        action={action}
      />
      <ul
        data-faded={faded || undefined}
        className="overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel shadow-gousse-sm"
      >
        {promos.map((promo) => (
          <SavedPromoRow
            key={promo.id}
            promo={promo}
            now={now}
            selected={promo.id === selectedId}
            onSelect={() => onSelect(promo.id)}
            faded={faded}
            showAccount={showAccount}
          />
        ))}
      </ul>
    </section>
  );
};
