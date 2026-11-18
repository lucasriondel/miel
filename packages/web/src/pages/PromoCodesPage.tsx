import { useCallback, useState } from "react";
import { Empty } from "@/components/ui/empty";
import { useSavedPromos, useSuggestedPromos } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import type { PromoListing } from "../api/types";
import { PageHeader } from "../features/shell/PageHeader";
import { PageLayout } from "../features/shell/PageLayout";
import { SavedPromosSection } from "../features/promos/SavedPromosSection";
import { SuggestedPromosSection } from "../features/promos/SuggestedPromosSection";
import { ClearExpiredPromosButton } from "../features/promos/ClearExpiredPromosButton";
import { NothingSavedSection } from "../features/promos/NothingSavedSection";
import { PromoCodesEmpty } from "../features/promos/PromoCodesEmpty";
import { PromoCodesSkeleton } from "../features/promos/PromoCodesSkeleton";
import { PromoReader } from "../features/promos/PromoReader";
import { usePromoPageSync } from "../features/promos/usePromoPageSync";

/**
 * Where promo codes live (#162, #154).
 *
 * A **global** route, beside logs and settings rather than under
 * `/account/:id`, and the layout's default-account redirect leaves it alone
 * because it is neither `/` nor an `/account` path. The reason is the use: a
 * promo code is a thing you use at a checkout, and which mailbox it arrived in
 * is trivia. So every account's codes are here at once, and the mailbox is said
 * on the row when there is more than one — information, never a gate.
 *
 * Three sections, in the order the questions are asked: what is waiting to be
 * reviewed, what is about to lapse, and what already has. Every order and split
 * among the three is the server's; the page reads them out. Opening a card or a
 * row puts that promo in the reader beside the list (`miel.figcraft`, Promo
 * codes › List + reader), which is where its mail is read and its guesses are
 * corrected.
 *
 * Nothing here deletes by itself: an expired promo is greyed and kept, because
 * the record of what a shop offered is worth having and removing one is always
 * the user's own act — one row at a time, or the whole Expired section through
 * its "Clear expired" control.
 *
 * Two reads rather than one, because the two halves are invalidated by
 * different acts — a mail leaving the inbox moves the suggestions and not the
 * saved rows, and an edit moves the saved rows and not the suggestions. The
 * save is the one act that moves both.
 */
export const PromoCodesPage = () => {
  const { data, isLoading, error } = useSavedPromos();
  const suggestions = useSuggestedPromos();
  const { sync, syncing } = usePromoPageSync();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // One clock for every deadline on screen, taken per render.
  const now = new Date();

  const suggested = suggestions.data?.items ?? [];
  const active = data?.active ?? [];
  const expired = data?.expired ?? [];

  // The reader steps through the page in the order it is read.
  const ordered: PromoListing[] = [...suggested, ...active, ...expired];
  const index = selectedId === null ? -1 : ordered.findIndex((p) => p.id === selectedId);
  // A promo deleted while open simply closes the reader: the id names nothing.
  const open = index === -1 ? null : ordered[index]!;
  const showAccount = new Set(ordered.map((p) => p.accountId)).size > 1;
  const closeReader = useCallback(() => setSelectedId(null), []);

  const selection = { now, selectedId, onSelect: setSelectedId, showAccount };
  const nothingAtAll = suggested.length === 0 && active.length === 0 && expired.length === 0;

  const body = isLoading ? (
    <PromoCodesSkeleton />
  ) : error ? (
    <Empty title="Failed to load promo codes" description={apiErrorMessage(error)} />
  ) : nothingAtAll ? (
    // Only when there is nothing at all. A page carrying suggestions and no
    // saved rows is not empty — it is a page with something to do.
    <PromoCodesEmpty onSync={sync} syncing={syncing} />
  ) : (
    <div className="flex flex-col gap-7">
      <SuggestedPromosSection promos={suggested} {...selection} />
      {active.length === 0 && expired.length === 0 ? <NothingSavedSection /> : null}
      <SavedPromosSection title="Active" promos={active} {...selection} />
      <SavedPromosSection
        title="Expired"
        promos={expired}
        faded
        action={<ClearExpiredPromosButton count={expired.length} />}
        {...selection}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <PageLayout
        header={<PageHeader title="Promo codes" />}
        bodyClassName="px-5 pt-[22px] pb-8 sm:px-8"
      >
        {body}
      </PageLayout>
      {open ? (
        <PromoReader
          promo={open}
          saved={index >= suggested.length}
          expired={index >= suggested.length + active.length}
          now={now}
          index={index}
          total={ordered.length}
          onPrev={() => setSelectedId(ordered[index - 1]?.id ?? open.id)}
          onNext={() => setSelectedId(ordered[index + 1]?.id ?? open.id)}
          onClose={closeReader}
        />
      ) : null}
    </div>
  );
};
