// The Postgres adapters (#132), against the real `app_settings` and
// `encrypted_secrets` tables.
//
// Everything else in the seam runs on the in-memory adapter, which is only
// worth anything if it answers the way this one does — so both are held to the
// same spec, `testkit/storeContract`, and neither file restates it. What this
// one adds is the part a Map cannot stand in for: the upsert is really an `ON
// CONFLICT DO UPDATE` against a primary key, a missing row is really an empty
// result set rather than a null column, and `RETURNING` is really what the
// removal count comes from.
//
// ── why `.dbtest.ts` rather than `.test.ts` ─────────────────────────────────
// This is the one suite in the package that has to reach the *real*
// `db/client`, and `mock.module` is process-global: a suite that fakes the
// client owns `getDb` for every file loaded after it. Inside the `bun test
// ./src` sweep these tests are served by whichever fake loaded first —
// `google/GoogleAuth.test.ts`'s, in file order, whose `select` chain answers
// `[]` — so "no row yet" would pass with no database behind it and every write
// would fail on a `db.insert` that fake has never had. `mock.restore()` does
// not undo a module mock, so the only reliable isolation is a process of its
// own: `scripts/test-with-db.sh` runs this file by path, which is why its name
// sits outside bun's collection glob. It rejoins the sweep once the aggregates
// that still fake the client (filters, logs, GoogleAuth) have stores too.
//
// It needs a migrated database — `bun run test` gives it one (an ephemeral
// container, or the `DATABASE_URL` CI hands in) — and fails loudly rather than
// skipping when there is none, because a contract nobody checks is one the fake
// would be alone in satisfying.
import { afterAll } from "bun:test";
import { like } from "drizzle-orm";
import { closeDb, getDb } from "../db/client";
import { appSettings, encryptedSecrets } from "../db/schema";
import {
  CONTRACT_KEY_PREFIX,
  secretStoreContract,
  settingsStoreContract,
} from "../testkit/storeContract";
import { SecretStoreLive, SettingsStoreLive } from "./postgres";

// One live layer for every test: the adapter holds no state of its own, and the
// contract's keys are unique per test, so there is nothing to reset between them.
settingsStoreContract("the Postgres settings store", () => SettingsStoreLive);
secretStoreContract("the Postgres secret store", () => SecretStoreLive);

// The contract's rows are the only ones this file writes, and they all carry its
// prefix — so the sweep is exact, and a database handed in by DATABASE_URL (in
// CI, or a developer's own) is left as it was found.
afterAll(async () => {
  const { db } = getDb();
  await db.delete(appSettings).where(like(appSettings.key, `${CONTRACT_KEY_PREFIX}%`));
  await db.delete(encryptedSecrets).where(like(encryptedSecrets.name, `${CONTRACT_KEY_PREFIX}%`));
  // This process exists only for these tests, so the pool goes with them.
  await closeDb();
});
