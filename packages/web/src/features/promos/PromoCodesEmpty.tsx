import { Tag } from "lucide-react";
import { Link } from "react-router-dom";
import { AppButton } from "../../components/AppButton";

interface Props {
  /** Fetches the period on screen; absent when there is no mailbox to sync. */
  onSync?: () => void;
  syncing?: boolean;
}

/**
 * The page with nothing on it at all — nothing saved and nothing to review.
 *
 * The copy says why rather than only that: codes come from new mail as each
 * sync runs, and older mail is not scanned (the extraction fills forward, see
 * AGENTS.md "Extracting promo codes") — so it points at the one way to ask an
 * older mail, the message page's Find promo codes.
 */
export const PromoCodesEmpty = ({ onSync, syncing }: Props) => (
  <div className="flex flex-col items-center gap-3 px-6 pt-[18vh] text-center">
    <span className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-gousse-line bg-gousse-panel text-gousse-ink shadow-gousse-sm">
      <Tag className="h-5 w-5" aria-hidden />
    </span>
    <h2 className="text-base font-semibold text-gousse-ink">No promo codes yet</h2>
    <p className="max-w-[400px] text-[13px] leading-5 text-gousse-muted">
      Codes found in new marketing mail land here as each sync runs, ready to review and save. Older
      mail isn&rsquo;t scanned — open one and use Find promo codes to check it.
    </p>
    <div className="mt-1 flex items-center gap-2">
      <Link
        to="/"
        className="inline-flex h-[30px] items-center rounded-lg border border-gousse-border bg-gousse-panel px-3 text-xs font-semibold text-gousse-ink hover:border-gousse-border-strong hover:bg-gousse-hover"
      >
        Back to inbox
      </Link>
      {onSync ? (
        <AppButton tone="primary" onClick={onSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </AppButton>
      ) : null}
    </div>
  </div>
);
