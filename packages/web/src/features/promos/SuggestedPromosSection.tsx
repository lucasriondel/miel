import type { PromoListing } from "../../api/types";
import { PromoSectionHeader } from "./PromoSectionHeader";
import { SuggestionCard } from "./SuggestionCard";

interface Props {
  promos: PromoListing[];
  now: Date;
  selectedId: string | null;
  onSelect: (id: string) => void;
  showAccount: boolean;
}

/**
 * The page's top section (#154), "To review": every detection nobody has acted
 * on yet, as a row of cards.
 *
 * It exists because of the cap above the inbox: a cap with nowhere to overflow
 * into is a cap that *loses* offers, so this is where the rest are — uncapped,
 * and scoped to no account and no period, because the page is global. Every
 * other rule is the inbox section's, unchanged and decided once on the server —
 * unsaved only, still in the inbox, unexpired, one row per code.
 *
 * Above the saved sections because it is the only part of the page with
 * something to decide. Nothing at all when there is nothing suggested: an empty
 * heading on the page's steady state is chrome tax.
 */
export const SuggestedPromosSection = ({
  promos,
  now,
  selectedId,
  onSelect,
  showAccount,
}: Props) => {
  if (promos.length === 0) return null;

  return (
    <section aria-label="Promo codes to review" className="@container flex flex-col gap-2.5">
      <PromoSectionHeader title="To review" count={promos.length} tone="review" />
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {promos.map((promo) => (
          <SuggestionCard
            key={promo.id}
            promo={promo}
            now={now}
            selected={promo.id === selectedId}
            onSelect={() => onSelect(promo.id)}
            showAccount={showAccount}
          />
        ))}
      </div>
    </section>
  );
};
