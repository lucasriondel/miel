import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { accounts } from "../db/schema";
import { createGogAdapter, type GogAdapter } from "../adapters/gog";
import { createDebug } from "../util/debug";

const debug = createDebug("service:accounts");

export interface SyncedAccount {
  id: string;
  email: string;
  displayName: string | null;
  inserted: boolean;
}

export async function syncAccountsFromGog(
  gog: GogAdapter = createGogAdapter(),
): Promise<SyncedAccount[]> {
  debug("syncAccountsFromGog start");
  const { db } = getDb();
  const remote = await gog.listAccounts();
  debug("syncAccountsFromGog remote", { count: remote.length });

  const synced: SyncedAccount[] = [];
  for (const account of remote) {
    const existing = await db
      .select({
        id: accounts.id,
        email: accounts.email,
        displayName: accounts.displayName,
      })
      .from(accounts)
      .where(eq(accounts.email, account.email))
      .limit(1);

    if (existing.length > 0) {
      synced.push({
        id: existing[0].id,
        email: existing[0].email,
        displayName: existing[0].displayName,
        inserted: false,
      });
      continue;
    }

    const inserted = await db
      .insert(accounts)
      .values({ email: account.email })
      .returning({
        id: accounts.id,
        email: accounts.email,
        displayName: accounts.displayName,
      });
    synced.push({
      id: inserted[0].id,
      email: inserted[0].email,
      displayName: inserted[0].displayName,
      inserted: true,
    });
    debug("syncAccountsFromGog inserted", { email: inserted[0].email });
  }
  debug("syncAccountsFromGog done", {
    total: synced.length,
    new: synced.filter((s) => s.inserted).length,
  });
  return synced;
}

export async function getAccountByEmail(
  email: string,
): Promise<{ id: string; email: string } | null> {
  const { db } = getDb();
  const rows = await db
    .select({ id: accounts.id, email: accounts.email })
    .from(accounts)
    .where(eq(accounts.email, email))
    .limit(1);
  debug("getAccountByEmail", { email, found: rows.length > 0 });
  return rows.length > 0 ? rows[0] : null;
}
