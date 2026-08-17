import { Command, InvalidOptionArgumentError } from "commander";
import { applySuggestions, getLatestTriageForMessage, getDb, schema } from "@miel/core";
import { eq } from "drizzle-orm";

function parseMessageId(input: string): {
  accountEmail: string;
  gmailMessageId: string;
} {
  const idx = input.indexOf(":");
  if (idx < 0) {
    throw new InvalidOptionArgumentError("Expected --message-id=<accountEmail>:<gmailMessageId>");
  }
  const accountEmail = input.slice(0, idx).trim();
  const gmailMessageId = input.slice(idx + 1).trim();
  if (!accountEmail || !gmailMessageId) {
    throw new InvalidOptionArgumentError("Both accountEmail and gmailMessageId are required");
  }
  return { accountEmail, gmailMessageId };
}

export function applyCommand(): Command {
  return new Command("apply")
    .description("Apply suggested labels (existing and/or new) from the latest triage of a message")
    .requiredOption(
      "--message-id <accountEmail:gmailMessageId>",
      "Target message identifier",
      parseMessageId,
    )
    .option(
      "--all",
      "Accept every pending suggestion (existing + new) for the latest triage",
      false,
    )
    .option("--existing-only", "Only accept existing-label suggestions", false)
    .option("--new-only", "Only accept new-label suggestions", false)
    .action(
      async (opts: {
        messageId: { accountEmail: string; gmailMessageId: string };
        all?: boolean;
        existingOnly?: boolean;
        newOnly?: boolean;
      }) => {
        const { accountEmail, gmailMessageId } = opts.messageId;
        const { db } = getDb();
        const accRows = await db
          .select({ id: schema.accounts.id })
          .from(schema.accounts)
          .where(eq(schema.accounts.email, accountEmail))
          .limit(1);
        if (accRows.length === 0) {
          throw new Error(`Account not synced: ${accountEmail}`);
        }
        const latest = await getLatestTriageForMessage({
          accountId: accRows[0].id,
          gmailMessageId,
        });
        if (!latest) {
          console.log(
            `No triage found for ${accountEmail}:${gmailMessageId}. Run \`miel sync\` first.`,
          );
          return;
        }
        const pendingExisting = latest.existingLabelSuggestions.filter(
          (s) => s.status === "pending",
        );
        const pendingNew = latest.newLabelSuggestions.filter((s) => s.status === "pending");

        const includeExisting = !opts.newOnly;
        const includeNew = !opts.existingOnly;

        const acceptExistingLabelIds = includeExisting ? pendingExisting.map((s) => s.labelId) : [];
        const acceptNewSuggestionIds = includeNew ? pendingNew.map((s) => s.suggestionId) : [];

        if (acceptExistingLabelIds.length === 0 && acceptNewSuggestionIds.length === 0) {
          console.log("No pending suggestions to apply.");
          return;
        }

        const result = await applySuggestions({
          triageId: latest.triageId,
          accountEmail,
          gmailMessageId,
          acceptExistingLabelIds,
          acceptNewSuggestionIds,
        });
        console.log(
          `Applied ${result.appliedExistingLabelIds.length} existing label(s), created ${result.createdLabels.length} new label(s).`,
        );
        for (const a of result.attached) {
          console.log(`  + ${a.name}`);
        }
      },
    );
}
