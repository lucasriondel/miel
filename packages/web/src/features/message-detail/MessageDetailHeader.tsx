import type { MessageDetail } from "../../api/types";
import { MessageLabels } from "../../components/MessageLabels";
import { AddLabelButton } from "./AddLabelButton";
import { MessageMetaDisclosure } from "./MessageMetaDisclosure";
import { SenderLine } from "./SenderLine";

interface Props {
  message: MessageDetail;
}

export const MessageDetailHeader = ({ message }: Props) => {
  const latest = message.triageHistory[0];
  const existingSuggestions =
    latest?.existingLabelSuggestions
      .filter((s) => s.status === "pending")
      .filter((s) => !message.labels.some((l) => l.id === s.labelId))
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
    <header className="flex flex-col gap-3 border-b border-gousse-line/50 pb-6">
      <h1 className="text-2xl font-bold text-gousse-ink text-balance leading-tight">
        {message.subject?.trim() || "(no subject)"}
      </h1>
      <SenderLine message={message} />
      {/* The row used to ask whether it had a badge to draw and render nothing
          when it had none. Since #167 it always has something: `MessageLabels`
          self-hides when empty, and what is left is the trigger that labels a
          message carrying no label at all — which is the message someone most
          often opened in order to label. Attachments used to count as badges
          here; since #143 they are a section of their own below the body. */}
      <div className="flex flex-wrap items-center gap-2">
        <MessageLabels
          accountId={message.accountId}
          gmailMessageId={message.gmailMessageId}
          triageId={latest?.id ?? null}
          labels={message.labels}
          existingSuggestions={existingSuggestions}
          newSuggestions={newSuggestions}
          variant="full"
        />
        <AddLabelButton message={message} />
      </div>
      {/* Last in the header so opening it pushes nothing but the hairline down. */}
      <MessageMetaDisclosure message={message} />
    </header>
  );
};
