# The store seam

Services do not build their own queries. The stores (`packages/core/src/stores/contracts.ts`) are narrow `Effect.Tag` services, one per aggregate, each with a Postgres adapter (`stores/postgres.ts`) and an in-memory one (`testkit/stores.ts`, `testkit/mailbox.ts`). Two implementations are what make the seam real (#132).

There are six: `SettingsStore` and `SecretStore` (`app_settings`, `encrypted_secrets`); `MessageStore`, `TriageStore` and `LabelStore` (the mailbox: list rows, triage results, the label catalogue); `PromoStore` (`promo_codes`, with exactly the operations the promo services make). A store spans more than one table where the read model does — the row shape is what the seam promises, not the join that produces it.

The requirement rides in the `R` channel, so the *boundary* answers it: Promise facades call `runWithStores(effect)` (`stores/postgres.ts`), and `AppLive` and the sync entry points provide `StoresLive`. An effect with no store provided does not compile, so a test that forgets to inject gets a type error rather than a connection attempt.

`makeTestStores({ settings, secrets, mailbox })` is what a suite uses: `stores.run(effect)` at the Promise boundary, `stores.provide(effect)` when the Exit is asserted, seeded rows for "already stored", recorded `writes`/`removals` (and the mailbox row arrays) for storage assertions, and `offline = true` for "the database is unreachable". Mailbox rows are seeded with only the columns a test cares about. `testkit/gmail.ts` is a recording `GmailDataAdapter` that can be told to refuse. Write suites against these rather than `mock.module("../db/client")`.

What stays in the services is the part worth testing: the cursor's encoding, which suggestions still count as pending, that a label id from another account names nothing, and that Gmail is told before anything is written locally.

The seam is drawn at the ciphertext: `encrypt`/`decrypt` stay in `services/encryptedSecrets.ts`, so a store sees a blob and never a secret. `stores/seam.test.ts` guards that the seamed services import nothing that talks to Postgres, that no adapter imports `util/crypto`, and that only one adapter ships: nothing outside a test may import the testkit, and neither the barrel nor core's subpath `exports` may name `stores/` or `testkit/`. A production module importing `testkit/stores` would write settings to a Map and lose them on restart with every suite still green.

The contract is written once — `testkit/storeContract.ts` — and run against both adapters: `testkit/stores.test.ts` (Map) and `stores/postgres.dbtest.ts` (real tables).

That Postgres file is named `.dbtest.ts` on purpose and `scripts/test-with-db.sh` runs it by path, in its own process, after the `bun test ./src` sweep. The remaining fakes (filters, logs, GoogleAuth) are `mock.module`, which is process-global and owns `getDb` for every file loaded after it — inside the sweep, "no row yet" would pass with no database behind it, and `mock.restore()` does not undo a module mock. It rejoins the sweep when those aggregates have stores too.
