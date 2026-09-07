import { Command } from "commander";
import { getDb, schema } from "@miel/core";

export function accountsCommand(): Command {
  const cmd = new Command("accounts").description("Manage Gmail accounts");

  cmd
    .command("list")
    .description("List accounts currently stored in the database")
    .action(async () => {
      const { db } = getDb();
      const rows = await db
        .select({
          email: schema.accounts.email,
          displayName: schema.accounts.displayName,
          lastSyncedAt: schema.accounts.lastSyncedAt,
        })
        .from(schema.accounts);
      if (rows.length === 0) {
        console.log("(no accounts — connect one from the web Settings → Connect with Google)");
        return;
      }
      for (const r of rows) {
        const synced = r.lastSyncedAt ? r.lastSyncedAt.toISOString() : "never";
        console.log(`${r.email}\tlastSyncedAt=${synced}`);
      }
    });

  return cmd;
}
