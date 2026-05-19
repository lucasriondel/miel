import { Command, InvalidOptionArgumentError } from "commander";
import { generateReply, sendReply } from "@miel/core";

function parseMessageId(input: string): {
  accountEmail: string;
  gmailMessageId: string;
} {
  const idx = input.indexOf(":");
  if (idx < 0) {
    throw new InvalidOptionArgumentError(
      "Expected --message-id=<accountEmail>:<gmailMessageId>",
    );
  }
  const accountEmail = input.slice(0, idx).trim();
  const gmailMessageId = input.slice(idx + 1).trim();
  if (!accountEmail || !gmailMessageId) {
    throw new InvalidOptionArgumentError(
      "Both accountEmail and gmailMessageId are required",
    );
  }
  return { accountEmail, gmailMessageId };
}

export function replyCommand(): Command {
  return new Command("reply")
    .description(
      "Generate an AI-assisted reply for a message; optionally send it",
    )
    .requiredOption(
      "--message-id <accountEmail:gmailMessageId>",
      "Target message identifier",
      parseMessageId,
    )
    .requiredOption("--prompt <text>", "Instruction for the reply")
    .option(
      "--send",
      "Send the generated draft via Gmail immediately",
      false,
    )
    .action(
      async (opts: {
        messageId: { accountEmail: string; gmailMessageId: string };
        prompt: string;
        send?: boolean;
      }) => {
        const { accountEmail, gmailMessageId } = opts.messageId;
        const draft = await generateReply({
          accountEmail,
          gmailMessageId,
          prompt: opts.prompt,
        });
        console.log("--- draft (model=" + draft.model + ") ---");
        console.log(`Subject: ${draft.subject}`);
        console.log("");
        console.log(draft.body);
        console.log("--- end draft ---");

        if (opts.send) {
          const sent = await sendReply({
            accountEmail,
            gmailMessageId,
            subject: draft.subject,
            body: draft.body,
          });
          console.log(`Sent. sentMessageId=${sent.sentMessageId}`);
        } else {
          console.log("(Pass --send to deliver this draft via Gmail.)");
        }
      },
    );
}
