import type { ReactNode } from "react";

/** One labelled line of the ticket's details — Terms, Valid until, Shop. */
export const PromoTicketDetail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex gap-3">
    <dt className="w-[62px] shrink-0 pt-px text-xs font-medium text-gousse-tint-amber-ink/80">
      {label}
    </dt>
    <dd className="min-w-0 flex-1 text-[13px] leading-[19px] text-gousse-body">{children}</dd>
  </div>
);
