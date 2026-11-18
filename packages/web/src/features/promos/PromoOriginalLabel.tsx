import { MailOpen } from "lucide-react";

/** The rule that separates the promo from the mail it was read out of. */
export const PromoOriginalLabel = ({ children }: { children: string }) => (
  <div className="flex items-center gap-2 pt-2.5 text-xs font-semibold text-gousse-body">
    <MailOpen className="h-3.5 w-3.5 shrink-0 text-gousse-muted" aria-hidden />
    <span className="shrink-0">{children}</span>
    <span aria-hidden className="h-px flex-1 bg-gousse-line" />
  </div>
);
