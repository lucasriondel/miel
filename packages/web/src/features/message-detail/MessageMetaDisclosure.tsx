import { format } from "date-fns";
import type { MessageDetail } from "../../api/types";
import { DetailCard } from "./DetailCard";
import { DisclosureRow } from "./DisclosureRow";

interface Props {
  message: MessageDetail;
}

const MetaRow = ({ term, children }: { term: string; children: React.ReactNode }) => (
  <>
    <dt className="font-medium text-gousse-muted">{term}</dt>
    <dd className="break-words font-medium text-gousse-ink">{children}</dd>
  </>
);

/**
 * To / Date / Account, collapsed behind a `Details` pill (#88). They are the
 * three rows that are near-always the same values from message to message, so
 * they cost the header four rows of height to say nothing most of the time.
 *
 * Still a `<dl>`: the collapse is a visual decision, and the term/value pairing
 * is what the markup means either way. `w-fit` overrides the primitive's
 * full-width summary — the control reads as a label here, not a section header.
 */
export const MessageMetaDisclosure = ({ message }: Props) => {
  const date = new Date(message.internalDate);
  const hasDate = !Number.isNaN(date.getTime());

  return (
    <DisclosureRow label="Details" summaryClassName="w-fit gap-2 pr-3">
      <DetailCard className="mt-2 px-5 py-4">
        <dl className="grid grid-cols-[76px_1fr] gap-x-4 gap-y-2 text-sm">
          <MetaRow term="To">
            {message.toEmails.length > 0 ? message.toEmails.join(", ") : "—"}
          </MetaRow>
          <MetaRow term="Date">
            <span className="tabular-nums">{hasDate ? format(date, "PPpp") : "—"}</span>
          </MetaRow>
          <MetaRow term="Account">{message.accountEmail}</MetaRow>
        </dl>
      </DetailCard>
    </DisclosureRow>
  );
};
