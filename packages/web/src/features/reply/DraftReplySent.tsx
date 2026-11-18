import { Check, ExternalLink } from "lucide-react";
import { DraftReplyShell } from "./DraftReplyShell";

interface Props {
  body: string;
  /** "· 10:58 · archived" */
  summary: string;
  href: string | null;
}

/** Sent from the card: what went, and when — the card stays as the record of it. */
export const DraftReplySent = ({ body, summary, href }: Props) => (
  <DraftReplyShell
    tone="sent"
    header={
      <>
        <Check className="text-gousse-tint-green-ink" aria-hidden />
        <output className="font-semibold text-gousse-tint-green-ink">Reply sent</output>
        <span className="text-gousse-muted">{summary}</span>
      </>
    }
    aside={
      href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-gousse-ink hover:underline"
        >
          View in Gmail
          <ExternalLink aria-hidden />
        </a>
      ) : null
    }
  >
    <p className="text-[13px] leading-5 whitespace-pre-wrap text-gousse-muted">{body}</p>
  </DraftReplyShell>
);
