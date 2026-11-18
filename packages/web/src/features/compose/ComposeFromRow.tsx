import { ComposeFieldRow } from "./ComposeFieldRow";

interface Props {
  accountName: string | null;
  accountEmail: string;
}

/**
 * The mailbox the message goes from. Static: a reply leaves from the mailbox
 * the message arrived in and a new mail from the one on screen — sending as
 * another connected mailbox is not something the send path can do.
 */
export const ComposeFromRow = ({ accountName, accountEmail }: Props) => (
  <ComposeFieldRow label="From">
    <p className="flex min-w-0 items-baseline gap-2 truncate">
      {accountName ? <span className="font-medium text-gousse-ink">{accountName}</span> : null}
      <span
        className={
          accountName ? "truncate text-gousse-muted" : "truncate font-medium text-gousse-ink"
        }
      >
        {accountEmail}
      </span>
    </p>
  </ComposeFieldRow>
);
