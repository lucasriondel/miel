import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { accounts, messageAttachments, messageLabels, triages } from "../db/schema";
import { encrypt } from "../util/crypto";
import { createDebug } from "../util/debug";
import { runPromiseRethrow } from "../util/effect";

const debug = createDebug("service:accounts");

export interface SyncedAccount {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  inserted: boolean;
}

export interface ConnectAccountInput {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Raw refresh token from the OAuth exchange — encrypted before storage. */
  refreshToken: string;
  scopes: string[];
}

/**
 * Upsert a connected Google account from an OAuth callback: store the (encrypted)
 * refresh token, granted scopes, profile, and stamp `connectedAt`. Keyed by
 * email so reconnecting the same account refreshes its grant in place.
 */
export const connectAccountEffect = (input: ConnectAccountInput): Effect.Effect<SyncedAccount> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const encrypted = encrypt(input.refreshToken);
    const now = new Date();
    const existing = yield* Effect.promise(() =>
      db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, input.email)).limit(1),
    );
    if (existing.length > 0) {
      const updated = yield* Effect.promise(() =>
        db
          .update(accounts)
          .set({
            displayName: input.displayName,
            avatarUrl: input.avatarUrl,
            refreshToken: encrypted,
            scopes: input.scopes,
            connectedAt: now,
          })
          .where(eq(accounts.id, existing[0].id))
          .returning({
            id: accounts.id,
            email: accounts.email,
            displayName: accounts.displayName,
            avatarUrl: accounts.avatarUrl,
          }),
      );
      debug("connectAccount updated", { email: input.email });
      return { ...updated[0], inserted: false };
    }
    const inserted = yield* Effect.promise(() =>
      db
        .insert(accounts)
        .values({
          email: input.email,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
          refreshToken: encrypted,
          scopes: input.scopes,
          connectedAt: now,
        })
        .returning({
          id: accounts.id,
          email: accounts.email,
          displayName: accounts.displayName,
          avatarUrl: accounts.avatarUrl,
        }),
    );
    debug("connectAccount inserted", { email: input.email });
    return { ...inserted[0], inserted: true };
  });

/** Refresh just the display name + avatar for a connected account (best-effort). */
export const refreshAccountProfileEffect = (args: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const { db } = getDb();
    yield* Effect.promise(() =>
      db
        .update(accounts)
        .set({ displayName: args.displayName, avatarUrl: args.avatarUrl })
        .where(eq(accounts.id, args.id)),
    );
    debug("refreshAccountProfile", { id: args.id });
  });

export const getAccountByEmailEffect = (
  email: string,
): Effect.Effect<{ id: string; email: string } | null> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const rows = yield* Effect.promise(() =>
      db
        .select({ id: accounts.id, email: accounts.email })
        .from(accounts)
        .where(eq(accounts.email, email))
        .limit(1),
    );
    debug("getAccountByEmail", { email, found: rows.length > 0 });
    return rows.length > 0 ? rows[0] : null;
  });

export interface RemovedAccount {
  id: string;
  email: string;
}

/**
 * Disconnect an account and forget everything it owns.
 *
 * Most child tables (`labels`, `messages`, `gmail_filters`, `suggested_filters`,
 * `sync_windows`, `triage_runs`) carry an `onDelete: "cascade"` FK to
 * `accounts.id`, so Postgres clears them for us. Three do NOT: `triages`,
 * `message_labels` and `message_attachments` store a bare `account_id` with no
 * foreign key, so dropping the account alone would leave them orphaned and they
 * are deleted explicitly here. All of it runs in one transaction, so a failure
 * part-way through leaves the account and its data intact rather than half-gone.
 *
 * Returns null when no such account exists, which the route turns into a 404.
 *
 * Note this only removes local state: the Google-side OAuth grant is not
 * revoked, so reconnecting the same mailbox needs no re-consent.
 */
export const removeAccountEffect = (accountId: string): Effect.Effect<RemovedAccount | null> =>
  Effect.gen(function* () {
    const { db } = getDb();
    const existing = yield* Effect.promise(() =>
      db
        .select({ id: accounts.id, email: accounts.email })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1),
    );
    if (existing.length === 0) {
      debug("removeAccount not found", { id: accountId });
      return null;
    }
    const account = existing[0];

    yield* Effect.promise(() =>
      db.transaction(async (tx) => {
        // The FK-less tables first: once the account row is gone we can still
        // match them on account_id, but doing it inside one transaction keeps
        // the whole removal atomic.
        await tx.delete(messageAttachments).where(eq(messageAttachments.accountId, accountId));
        await tx.delete(messageLabels).where(eq(messageLabels.accountId, accountId));
        await tx.delete(triages).where(eq(triages.accountId, accountId));
        await tx.delete(accounts).where(eq(accounts.id, accountId));
      }),
    );

    debug("removeAccount done", { id: accountId, email: account.email });
    return account;
  });

// Promise facades for the API/CLI boundary.
export async function getAccountByEmail(
  email: string,
): Promise<{ id: string; email: string } | null> {
  return runPromiseRethrow(getAccountByEmailEffect(email));
}

export async function connectAccount(input: ConnectAccountInput): Promise<SyncedAccount> {
  return runPromiseRethrow(connectAccountEffect(input));
}

export async function refreshAccountProfile(args: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}): Promise<void> {
  return runPromiseRethrow(refreshAccountProfileEffect(args));
}

export async function removeAccount(accountId: string): Promise<RemovedAccount | null> {
  return runPromiseRethrow(removeAccountEffect(accountId));
}
