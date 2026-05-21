import { format } from "date-fns";
import type { MessageDetail } from "../../api/types";
import { MessageLabels } from "../../components/MessageLabels";

interface Props {
  message: MessageDetail;
}

export const MessageDetailHeader = ({ message }: Props) => {
  const latest = message.triageHistory[0];
  const existingSuggestions =
    latest?.existingLabelSuggestions
      .filter((s) => s.status === "pending")
      .filter(
        (s) => !message.labels.some((l) => l.id === s.labelId),
      )
      .map((s) => ({
        labelId: s.labelId,
        name: s.name,
        colorBg: s.colorBg,
        colorFg: s.colorFg,
      })) ?? [];
  const newSuggestions =
    latest?.newLabelSuggestions
      .filter((s) => s.status === "pending")
      .map((s) => ({ suggestionId: s.suggestionId, name: s.name })) ?? [];

  return (
    <header className="flex flex-col gap-3 border-b border-miel-line pb-4">
      <h1 className="text-xl font-semibold text-miel-ink">
        {message.subject ?? "(no subject)"}
      </h1>
      <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-miel-muted">From</dt>
        <dd className="text-miel-ink">
          {message.fromName ? (
            <>
              <span className="font-medium">{message.fromName}</span>{" "}
              <span className="text-miel-muted">&lt;{message.fromEmail}&gt;</span>
            </>
          ) : (
            message.fromEmail
          )}
        </dd>
        <dt className="text-miel-muted">To</dt>
        <dd className="text-miel-ink">
          {message.toEmails.length > 0 ? message.toEmails.join(", ") : "—"}
        </dd>
        <dt className="text-miel-muted">Date</dt>
        <dd className="text-miel-ink">
          {format(new Date(message.internalDate), "PPpp")}
        </dd>
        <dt className="text-miel-muted">Account</dt>
        <dd className="text-miel-ink">{message.accountEmail}</dd>
      </dl>
      <MessageLabels
        accountId={message.accountId}
        gmailMessageId={message.gmailMessageId}
        triageId={latest?.id ?? null}
        labels={message.labels}
        existingSuggestions={existingSuggestions}
        newSuggestions={newSuggestions}
        variant="full"
      />
    </header>
  );
};
