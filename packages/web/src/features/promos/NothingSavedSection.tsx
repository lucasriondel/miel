import { Bookmark } from "lucide-react";
import { PromoSectionHeader } from "./PromoSectionHeader";

/**
 * The saved half of a page that has suggestions and nothing kept yet: the
 * heading at zero and one dashed card saying what saving does. A page with
 * something to review is not empty, so this is not the page's empty state.
 */
export const NothingSavedSection = () => (
  <section aria-label="Saved promo codes" className="flex flex-col gap-2">
    <PromoSectionHeader title="Saved" count={0} />
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gousse-border bg-gousse-bg px-4 py-5">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gousse-border bg-gousse-panel text-gousse-ink">
        <Bookmark className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[13px] font-semibold text-gousse-ink">Nothing saved yet</p>
        <p className="text-xs text-gousse-muted">
          Save a code from To review and it lands here, with a copy of the mail it came from — kept
          even after Gmail empties its trash.
        </p>
      </div>
    </div>
  </section>
);
