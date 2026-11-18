import { Check, ExternalLink } from "lucide-react";
import { AppButton } from "../../components/AppButton";

interface Props {
  /** "Sent to Claire Martin · 10:42" — who and when. */
  summary: string;
  /** The thread in Gmail, when the send answered one. */
  href: string | null;
  onClose: () => void;
}

/**
 * Sent: the controls are replaced by the confirmation, not joined by it — a
 * live Send beside "sent" invites a second copy of the same mail.
 */
export const SentFooter = ({ summary, href, onClose }: Props) => (
  <output className="flex shrink-0 items-center gap-2 border-t border-gousse-fill bg-gousse-tint-green py-3 pr-3 pl-4">
    <Check className="h-3.5 w-3.5 shrink-0 text-gousse-tint-green-ink" aria-hidden />
    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-gousse-tint-green-ink">
      {summary}
    </p>
    {href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold text-gousse-ink hover:bg-gousse-panel/60"
      >
        View in Gmail
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    ) : null}
    <AppButton tone="secondary" size="lg" onClick={onClose}>
      Close
    </AppButton>
  </output>
);
