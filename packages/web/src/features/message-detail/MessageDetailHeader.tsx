import type { ReactNode } from "react";
import type { MessageDetail } from "../../api/types";
import { MessageLabels } from "../../components/MessageLabels";
import { AddLabelButton } from "./AddLabelButton";
import { MessageMetaDisclosure } from "./MessageMetaDisclosure";
import { SenderLine } from "./SenderLine";

interface Props {
  message: MessageDetail;
  /** Between the title and the sender: the reader's priority banner. */
  banner?: ReactNode;
}

export const MessageDetailHeader = ({ message, banner }: Props) => {
  return (
    <header className="flex flex-col gap-5">
      <h1 className="text-[26px] leading-[1.2] font-bold tracking-[-0.01em] text-balance text-gousse-ink">
        {message.subject?.trim() || "(no subject)"}
      </h1>
      {banner}
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
          labels={message.labels}
        />
        <AddLabelButton message={message} />
      </div>
      {/* Last in the header so opening it pushes nothing but the hairline down. */}
      <MessageMetaDisclosure message={message} />
    </header>
  );
};
