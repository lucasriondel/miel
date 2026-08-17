/**
 * In-memory adapters for the settings and secret stores (#132).
 *
 * The second implementation of `../stores/contracts` — a Map instead of
 * Postgres — so a service suite can exercise the real service against a real
 * store without a database, without `mock.module`, and without a hand-rolled
 * drizzle query-builder chain that has to be updated whenever the service's
 * queries change.
 *
 * The recorded calls (`writes`, `removals`) are here because a couple of
 * assertions are genuinely about storage rather than about a return value:
 * that what reaches the secret store is ciphertext and not the key, and that a
 * rejected value is not written at all. Everything else should be asserted
 * through the service's own interface.
 *
 * Note what a fake secret store *cannot* see: the contract carries ciphertext,
 * so the single-decryptor rule holds here too.
 */
import { Effect, Layer } from "effect";
import { runPromiseRethrow } from "../util/effect";
import {
  LabelStore,
  MessageStore,
  SecretStore,
  SettingsStore,
  TriageStore,
  type SecretStoreImpl,
  type SettingsStoreImpl,
  type Stores,
} from "../stores/contracts";
// The mailbox aggregates' fakes (#136) share one dataset, so they live in their
// own module; `makeTestStores` composes them with these two.
import { makeFakeMailbox, type FakeMailbox, type MailboxSeed } from "./mailbox";

/** How an unreachable Postgres presents itself to a caller. */
const OUTAGE = () => new Error("ECONNREFUSED 127.0.0.1:5432");

/** Shared by both fakes: honour `offline` before touching the Map. */
const orOffline = <A>(store: { offline: boolean }, f: () => A): Effect.Effect<A> =>
  Effect.suspend(() => (store.offline ? Effect.die(OUTAGE()) : Effect.sync(f)));

export interface FakeSettingsStore extends SettingsStoreImpl {
  /** The stored rows. Seed them, or read back what the service wrote. */
  readonly rows: Map<string, string>;
  /** Every write, in order. */
  readonly writes: Array<{ key: string; value: string }>;
  /** When true, every operation fails the way an unreachable database does. */
  offline: boolean;
}

export interface FakeSecretStore extends SecretStoreImpl {
  /** The stored ciphertext by name. Seed it, or read back what was written. */
  readonly rows: Map<string, string>;
  /** Every write, in order — ciphertext, never a plaintext. */
  readonly writes: Array<{ name: string; ciphertext: string }>;
  /** Every removal, in order, whether or not a row was there. */
  readonly removals: string[];
  /** When true, every operation fails the way an unreachable database does. */
  offline: boolean;
}

export interface TestStores {
  readonly settings: FakeSettingsStore;
  readonly secrets: FakeSecretStore;
  /**
   * The mailbox behind `MessageStore`, `TriageStore` and `LabelStore` — seeded
   * rows, and the rows as they stand after the service under test wrote.
   */
  readonly mailbox: FakeMailbox;
  /** Both tags, ready for `Effect.provide`. */
  readonly layer: Layer.Layer<Stores>;
  /** `Effect.provide(eff, layer)` — the effect, with its stores satisfied. */
  readonly provide: <A, E>(eff: Effect.Effect<A, E, Stores>) => Effect.Effect<A, E>;
  /**
   * Run an effect against these stores at the Promise boundary, rethrowing the
   * original tagged failure the way the services' own facades do.
   */
  readonly run: <A, E>(eff: Effect.Effect<A, E, Stores>) => Promise<A>;
}

function makeSettingsStore(seed?: Record<string, string>): FakeSettingsStore {
  const rows = new Map(Object.entries(seed ?? {}));
  const store: FakeSettingsStore = {
    rows,
    writes: [],
    offline: false,
    read: (key) => orOffline(store, () => rows.get(key) ?? null),
    write: (key, value) =>
      orOffline(store, () => {
        rows.set(key, value);
        store.writes.push({ key, value });
      }),
  };
  return store;
}

function makeSecretStore(seed?: Record<string, string>): FakeSecretStore {
  const rows = new Map(Object.entries(seed ?? {}));
  const store: FakeSecretStore = {
    rows,
    writes: [],
    removals: [],
    offline: false,
    read: (name) => orOffline(store, () => rows.get(name) ?? null),
    write: (name, ciphertext) =>
      orOffline(store, () => {
        rows.set(name, ciphertext);
        store.writes.push({ name, ciphertext });
      }),
    remove: (name) =>
      orOffline(store, () => {
        store.removals.push(name);
        return rows.delete(name) ? 1 : 0;
      }),
  };
  return store;
}

/**
 * A fresh pair of in-memory stores plus the layer that provides them. Build one
 * per test (in `beforeEach`) rather than resetting a shared one — bun runs test
 * files in one process, and a store that outlives its suite is the leak the
 * `mock.module` fakes had.
 *
 * Seeded rows are not counted as writes, so "nothing was stored" stays
 * assertable in a suite that starts from an existing row.
 */
export function makeTestStores(seed?: {
  settings?: Record<string, string>;
  secrets?: Record<string, string>;
  mailbox?: MailboxSeed;
}): TestStores {
  const settings = makeSettingsStore(seed?.settings);
  const secrets = makeSecretStore(seed?.secrets);
  const mailbox = makeFakeMailbox(seed?.mailbox);
  const layer = Layer.mergeAll(
    Layer.succeed(SettingsStore, settings),
    Layer.succeed(SecretStore, secrets),
    Layer.succeed(MessageStore, mailbox.messageStore),
    Layer.succeed(TriageStore, mailbox.triageStore),
    Layer.succeed(LabelStore, mailbox.labelStore),
  );
  const provide = <A, E>(eff: Effect.Effect<A, E, Stores>) => Effect.provide(eff, layer);
  return {
    settings,
    secrets,
    mailbox,
    layer,
    provide,
    run: (eff) => runPromiseRethrow(provide(eff)),
  };
}
