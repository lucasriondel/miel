import { useEffect, useState } from "react";
import type { PromoListing } from "../../api/types";
import { PromoOriginalCopy } from "./PromoOriginalCopy";
import { PromoReaderPager } from "./PromoReaderPager";
import { PromoReaderToolbar } from "./PromoReaderToolbar";
import { PromoSuggestionSource } from "./PromoSuggestionSource";
import { PromoTicket } from "./PromoTicket";
import { PromoTicketEditor } from "./PromoTicketEditor";

interface Props {
  promo: PromoListing;
  /** Filed under Active or Expired, rather than To review. */
  saved: boolean;
  /** Whether it is filed under Expired — the ticket greys. */
  expired: boolean;
  now: Date;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * The right-hand pane: one promo, read in full (`miel.figcraft`, Promo codes ›
 * List + reader). The ticket on top, then — for a saved promo — the copy of the
 * mail the save took, which is often the only one left anywhere.
 *
 * Correcting the guesses happens here (#164), in place of the ticket. The edit
 * belongs to the open promo: stepping to another one leaves it, unsaved, the
 * way closing a row's editor did.
 *
 * Below `lg` the pane covers the list rather than squeezing beside it.
 */
export const PromoReader = ({
  promo,
  saved,
  expired,
  now,
  index,
  total,
  onPrev,
  onNext,
  onClose,
}: Props) => {
  const [editing, setEditing] = useState(false);

  useEffect(() => setEditing(false), [promo.id]);

  // Escape closes the pane — unless an editor is open, whose own Escape
  // abandons the typing first.
  useEffect(() => {
    if (editing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  return (
    <aside
      aria-label="Promo reader"
      className="fixed inset-0 z-40 flex flex-col bg-gousse-panel lg:static lg:z-auto lg:w-[44%] lg:max-w-[644px] lg:min-w-[440px] lg:shrink-0 lg:border-l lg:border-gousse-line"
    >
      <div className="flex h-[78px] shrink-0 items-center gap-2 px-6 sm:px-10">
        <PromoReaderToolbar
          promo={promo}
          saved={saved}
          editing={editing}
          onEdit={() => setEditing(true)}
        />
        <PromoReaderPager
          index={index}
          total={total}
          onPrev={onPrev}
          onNext={onNext}
          onClose={onClose}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-[34px] pb-7 sm:px-10">
        {editing ? (
          <PromoTicketEditor promo={promo} onDone={() => setEditing(false)} />
        ) : (
          <PromoTicket promo={promo} now={now} expired={expired} />
        )}
        {saved ? (
          <PromoOriginalCopy promoId={promo.id} accountEmail={promo.accountEmail} />
        ) : (
          <PromoSuggestionSource promo={promo} />
        )}
      </div>
    </aside>
  );
};
