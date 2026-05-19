import { Command } from "commander";
import { getDb, schema, syncAccountsFromGog } from "@miel/core";

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
        console.log("(no accounts — run `miel accounts sync` first)");
        return;
      }
      for (const r of rows) {
        const synced = r.lastSyncedAt
          ? r.lastSyncedAt.toISOString()
          : "never";
        console.log(`${r.email}\tlastSyncedAt=${synced}`);
      }
    });

  cmd
    .command("sync")
    .description("Re-pull authorized accounts from `gog auth list` and upsert")
    .action(async () => {
      const synced = await syncAccountsFromGog();
      for (const a of synced) {
        const tag = a.inserted ? "inserted" : "existing";
        console.log(`${a.email}\t${tag}`);
      }
      console.log(`Done. ${synced.length} account(s).`);
    });

  return cmd;
}
