/**
 * The contract both store adapters have to satisfy (#132), written once and run
 * against each of them.
 *
 * Two implementations are what make the seam real — but only if they answer the
 * same way. `testkit/stores.ts` is what every settings and secrets suite runs
 * against, so a Map that upserts differently from `ON CONFLICT`, or that hands
 * back `undefined` where a row is missing, would make those suites agree with
 * each other and with nothing that ships. This module is the shared spec that
 * keeps the fake honest: `stores/postgres.dbtest.ts` applies it to the real
 * tables, `testkit/stores.test.ts` to the Map, and neither file restates it.
 *
 * Everything here goes through the tags. There is no assertion about a row
 * count, a query or a Map — those belong to whichever adapter has them, and are
 * asserted in that adapter's own file beside this suite's call.
 *
 * Keys and names are unique per test and per process, so the suite is safe to
 * run against a shared database: two adapters, or two runs of one, never
 * collide, and nothing has to be torn down between tests for a "no row yet"
 * assertion to hold. {@link CONTRACT_KEY_PREFIX} is what a database-backed
 * adapter's file sweeps away afterwards.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { Effect, type Layer } from "effect";
import { endOfDayUtc } from "../promoExpiry";
import { PromoStore, SecretStore, SettingsStore } from "../stores/contracts";

/** Every key and name this suite writes starts with it. */
export const CONTRACT_KEY_PREFIX = "storecontract.";

const RUN = crypto.randomUUID().slice(0, 8);
let counter = 0;

/** A key/name no other test — or earlier run against the same database — used. */
const freshKey = (what: string) => `${CONTRACT_KEY_PREFIX}${RUN}.${what}.${counter++}`;

/**
 * Values a store must hand back byte for byte. A ciphertext is `iv:tag:cipher`
 * base64, so the separators and the padding matter; a setting can legitimately
 * be empty (an unset worp base URL is stored as `""`).
 */
const VERBATIM = ["", " ", "a:b:c", "AAAA/BBB+CCC=", "µ nordic ø — 日本語", "x".repeat(4096)];

/**
 * Run the {@link SettingsStore} contract against `layerFor()`, which is called
 * once per test: an adapter that keeps state in the layer gets a fresh one, and
 * one that talks to a database can return the same live layer every time.
 */
export function settingsStoreContract(
  label: string,
  layerFor: () => Layer.Layer<SettingsStore>,
): void {
  describe(`${label} satisfies the SettingsStore contract`, () => {
    let run = <A>(eff: Effect.Effect<A, never, SettingsStore>): Promise<A> =>
      Effect.runPromise(Effect.provide(eff, layerFor()));

    beforeEach(() => {
      const layer = layerFor();
      run = (eff) => Effect.runPromise(Effect.provide(eff, layer));
    });

    test("answers null — not undefined — for a key with no row", async () => {
      expect(await run(SettingsStore.read(freshKey("missing")))).toBeNull();
    });

    test("reads back the value it was given", async () => {
      const key = freshKey("readback");
      await run(SettingsStore.write(key, "7d"));
      expect(await run(SettingsStore.read(key))).toBe("7d");
    });

    test("a second write to a key replaces the first, rather than adding a row", async () => {
      const key = freshKey("upsert");
      await run(SettingsStore.write(key, "a"));
      await run(SettingsStore.write(key, "b"));
      expect(await run(SettingsStore.read(key))).toBe("b");
    });

    test("keys do not see each other", async () => {
      const [one, two] = [freshKey("one"), freshKey("two")];
      await run(SettingsStore.write(one, "1"));
      expect(await run(SettingsStore.read(two))).toBeNull();
      await run(SettingsStore.write(two, "2"));
      expect(await run(SettingsStore.read(one))).toBe("1");
    });

    test.each(VERBATIM)("stores %j verbatim", async (value) => {
      const key = freshKey("verbatim");
      await run(SettingsStore.write(key, value));
      expect(await run(SettingsStore.read(key))).toBe(value);
    });
  });
}

/**
 * Run the {@link SecretStore} contract against `layerFor()`. Same shape as the
 * settings contract plus the removal, which is the operation with a return
 * value worth pinning: the delete route answers 404 on a 0.
 */
export function secretStoreContract(label: string, layerFor: () => Layer.Layer<SecretStore>): void {
  describe(`${label} satisfies the SecretStore contract`, () => {
    let run = <A>(eff: Effect.Effect<A, never, SecretStore>): Promise<A> =>
      Effect.runPromise(Effect.provide(eff, layerFor()));

    beforeEach(() => {
      const layer = layerFor();
      run = (eff) => Effect.runPromise(Effect.provide(eff, layer));
    });

    test("answers null — not undefined — for a name with no row", async () => {
      expect(await run(SecretStore.read(freshKey("missing")))).toBeNull();
    });

    test("reads back the ciphertext it was given", async () => {
      const name = freshKey("readback");
      await run(SecretStore.write(name, "iv:tag:cipher"));
      expect(await run(SecretStore.read(name))).toBe("iv:tag:cipher");
    });

    test("a second write to a name replaces the ciphertext", async () => {
      const name = freshKey("upsert");
      await run(SecretStore.write(name, "iv:tag:first"));
      await run(SecretStore.write(name, "iv:tag:second"));
      expect(await run(SecretStore.read(name))).toBe("iv:tag:second");
    });

    test("names do not see each other", async () => {
      const [one, two] = [freshKey("one"), freshKey("two")];
      await run(SecretStore.write(one, "iv:tag:one"));
      expect(await run(SecretStore.read(two))).toBeNull();
      await run(SecretStore.write(two, "iv:tag:two"));
      expect(await run(SecretStore.read(one))).toBe("iv:tag:one");
    });

    test("a removal reports the row it took, and the name reads null after", async () => {
      const name = freshKey("remove");
      await run(SecretStore.write(name, "iv:tag:cipher"));
      expect(await run(SecretStore.remove(name))).toBe(1);
      expect(await run(SecretStore.read(name))).toBeNull();
    });

    test("removing a name with no row is 0, not a failure", async () => {
      expect(await run(SecretStore.remove(freshKey("never-stored")))).toBe(0);
    });

    test("a removal takes one name only", async () => {
      const [gone, kept] = [freshKey("gone"), freshKey("kept")];
      await run(SecretStore.write(gone, "iv:tag:gone"));
      await run(SecretStore.write(kept, "iv:tag:kept"));
      await run(SecretStore.remove(gone));
      expect(await run(SecretStore.read(kept))).toBe("iv:tag:kept");
    });

    test.each(VERBATIM)("stores %j verbatim", async (ciphertext) => {
      const name = freshKey("verbatim");
      await run(SecretStore.write(name, ciphertext));
      expect(await run(SecretStore.read(name))).toBe(ciphertext);
    });
  });
}

/**
 * The world a promo row needs around it (#157): a store, and the mail it hangs
 * off.
 *
 * A promo is keyed back to a message, and the suggestion read joins it — for the
 * window it is scoped to, and for the mailbox rule that an unsaved detection
 * follows its message. One side of the seam enforces that with a foreign key and
 * a join, the other with an array lookup, so a contract that invented a
 * `(accountId, gmailMessageId)` pair out of thin air would exercise neither.
 * Each adapter's file says how a message comes to exist in its own storage.
 */
export interface PromoWorld {
  readonly layer: Layer.Layer<PromoStore>;
  /**
   * An account these messages belong to.
   *
   * Its email is part of the world because it is part of a saved row (#162):
   * the Promo Codes page is global, so the read names the mailbox each promo
   * arrived in, and a contract that only knew the id could not tell an adapter
   * that joined the right account from one that joined any.
   */
  readonly account: () => Promise<{ id: string; email: string }>;
  /** A message in that account, stored the way that adapter stores one. */
  readonly message: (args: {
    accountId: string;
    internalDate: Date;
    isTrashed?: boolean;
  }) => Promise<{ accountId: string; gmailMessageId: string }>;
}

/** An expiry, produced the one way `promo_codes` is written: end-of-day UTC. */
const endOfDay = (day: string) => endOfDayUtc(new Date(`${day}T12:00:00.000Z`));

const IN_WINDOW = new Date("2026-06-15T09:00:00.000Z");
const WINDOW = {
  internalDateFrom: new Date("2026-06-15T00:00:00.000Z"),
  internalDateTo: new Date("2026-06-22T00:00:00.000Z"),
};

/** A copy of the mail, as `markSaved` is handed one. */
const COPY = {
  subject: "20% off everything this week",
  fromName: "Zara",
  fromEmail: "newsletter@email.marketing-cloud.zara.com",
  internalDate: IN_WINDOW,
  bodyHtml: "<p>Use <b>SUMMER20</b> — µ nordic ø — 日本語</p>",
  bodyText: "Use SUMMER20",
};

/**
 * Run the {@link PromoStore} contract against `worldFor()`, called once per test.
 *
 * Nothing here asserts a total: `saved()` reads every account, so against a
 * shared database it also sees rows an earlier test — or an earlier run — left
 * behind. Every assertion is therefore about the ids this test created.
 */
export function promoStoreContract(label: string, worldFor: () => Promise<PromoWorld>): void {
  describe(`${label} satisfies the PromoStore contract`, () => {
    let world: PromoWorld;
    let accountId: string;
    let accountEmail: string;
    let run = <A>(eff: Effect.Effect<A, never, PromoStore>): Promise<A> =>
      Effect.runPromise(Effect.provide(eff, world.layer));

    beforeEach(async () => {
      world = await worldFor();
      ({ id: accountId, email: accountEmail } = await world.account());
      run = (eff) => Effect.runPromise(Effect.provide(eff, world.layer));
    });

    /** One extraction on a fresh in-window message, inserted and handed back. */
    const extract = async (fields?: {
      code?: string | null;
      discount?: string;
      terms?: string | null;
      expiresAt?: Date | null;
      merchant?: string | null;
      accountId?: string;
      internalDate?: Date;
      isTrashed?: boolean;
    }) => {
      const owner = fields?.accountId ?? accountId;
      const ref = await world.message({
        accountId: owner,
        internalDate: fields?.internalDate ?? IN_WINDOW,
        isTrashed: fields?.isTrashed,
      });
      const [row] = await run(
        PromoStore.insert([
          {
            ...ref,
            code: fields?.code === undefined ? "SUMMER20" : fields.code,
            discount: fields?.discount ?? "20% off",
            terms: fields?.terms === undefined ? "orders over £50" : fields.terms,
            expiresAt: fields?.expiresAt === undefined ? endOfDay("2026-06-30") : fields.expiresAt,
            merchant: fields?.merchant === undefined ? "Zara" : fields.merchant,
          },
        ]),
      );
      return row;
    };

    const suggestions = () => run(PromoStore.unsaved({ accountId, ...WINDOW }));
    const savedById = async (id: string) =>
      (await run(PromoStore.saved())).filter((r) => r.id === id);

    test("answers null — not undefined — for an id with no row", async () => {
      expect(await run(PromoStore.byId(crypto.randomUUID()))).toBeNull();
    });

    test("hands back what it inserted, with an id and in the unsaved state", async () => {
      const row = await extract();

      expect(row.id).toBeTruthy();
      expect(row.savedAt).toBeNull();
      expect(await run(PromoStore.byId(row.id))).toEqual(row);
    });

    test("stores the five extracted fields byte for byte", async () => {
      const row = await extract({
        code: "µ nordic ø — 日本語",
        discount: " 20 % ",
        terms: "x".repeat(4096),
        merchant: "",
      });

      const stored = await run(PromoStore.byId(row.id));
      expect(stored).toMatchObject({
        code: "µ nordic ø — 日本語",
        discount: " 20 % ",
        terms: "x".repeat(4096),
        merchant: "",
      });
    });

    test("keeps an expiry at the end-of-day UTC instant it was given", async () => {
      const expiresAt = endOfDay("2026-12-25");
      const row = await extract({ expiresAt });

      // Not just "a timestamp came back": the millisecond is the whole point of
      // storing a date this way, and a column that truncated to the day would
      // expire a promo the shop still honours.
      expect((await run(PromoStore.byId(row.id)))?.expiresAt).toEqual(expiresAt);
      expect(expiresAt.toISOString()).toBe("2026-12-25T23:59:59.999Z");
    });

    test("keeps the nullable fields null rather than defaulting them", async () => {
      const row = await extract({ code: null, terms: null, expiresAt: null, merchant: null });

      expect(await run(PromoStore.byId(row.id))).toMatchObject({
        code: null,
        terms: null,
        expiresAt: null,
        merchant: null,
        savedAt: null,
        subject: null,
        fromEmail: null,
        internalDate: null,
        bodyHtml: null,
        bodyText: null,
      });
    });

    test("inserts every row it is given, and nothing for an empty list", async () => {
      const ref = await world.message({ accountId, internalDate: IN_WINDOW });
      const rows = await run(
        PromoStore.insert([
          { ...ref, code: "A", discount: "10% off", terms: null, expiresAt: null, merchant: null },
          { ...ref, code: "B", discount: "£5 off", terms: null, expiresAt: null, merchant: null },
        ]),
      );

      expect(rows.map((r) => r.code).toSorted()).toEqual(["A", "B"]);
      expect(await run(PromoStore.insert([]))).toEqual([]);
    });

    test("suggests the unsaved rows of one account, inside the window", async () => {
      const mine = await extract();
      const other = await extract({ accountId: (await world.account()).id });
      const earlier = await extract({ internalDate: new Date("2026-06-01T09:00:00.000Z") });
      const later = await extract({ internalDate: new Date("2026-07-01T09:00:00.000Z") });

      const ids = (await suggestions()).map((r) => r.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(other.id);
      expect(ids).not.toContain(earlier.id);
      expect(ids).not.toContain(later.id);
    });

    test("stops suggesting a detection whose message left the inbox", async () => {
      const trashed = await extract({ isTrashed: true });

      expect((await suggestions()).map((r) => r.id)).not.toContain(trashed.id);
    });

    test("a saved row leaves the suggestions and joins the saved ones", async () => {
      const row = await extract();
      const savedAt = new Date("2026-06-16T10:00:00.000Z");

      await run(PromoStore.markSaved({ id: row.id, savedAt, message: COPY }));

      expect((await suggestions()).map((r) => r.id)).not.toContain(row.id);
      // …carrying the mailbox it arrived in, which is a column on the page and
      // therefore part of what a saved row *is* (#162).
      expect(await savedById(row.id)).toEqual([{ ...row, savedAt, ...COPY, accountEmail }]);
    });

    test("saving writes the copy of the mail, and saving again updates that one row", async () => {
      const row = await extract();
      const first = new Date("2026-06-16T10:00:00.000Z");
      const second = new Date("2026-06-17T10:00:00.000Z");

      await run(PromoStore.markSaved({ id: row.id, savedAt: first, message: COPY }));
      await run(
        PromoStore.markSaved({
          id: row.id,
          savedAt: second,
          message: { ...COPY, subject: null, bodyHtml: null },
        }),
      );

      const saved = await savedById(row.id);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        savedAt: second,
        subject: null,
        bodyHtml: null,
        bodyText: COPY.bodyText,
      });
    });

    test("saved rows are read across accounts, newest saved first", async () => {
      const second = await world.account();
      const older = await extract();
      const newer = await extract({ accountId: second.id });
      await run(
        PromoStore.markSaved({
          id: older.id,
          savedAt: new Date("2026-06-16T10:00:00.000Z"),
          message: COPY,
        }),
      );
      await run(
        PromoStore.markSaved({
          id: newer.id,
          savedAt: new Date("2026-06-18T10:00:00.000Z"),
          message: COPY,
        }),
      );

      const rows = (await run(PromoStore.saved())).filter((r) =>
        [older.id, newer.id].includes(r.id),
      );
      expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
      // Each row names *its own* mailbox, not the first one the read found.
      expect(rows.map((r) => r.accountEmail)).toEqual([second.email, accountEmail]);
    });

    test("a patch writes the fields it names and leaves the rest as stored", async () => {
      const row = await extract();
      await run(
        PromoStore.markSaved({
          id: row.id,
          savedAt: new Date("2026-06-16T10:00:00.000Z"),
          message: COPY,
        }),
      );

      await run(PromoStore.patch({ id: row.id, fields: { code: "SUMMER25", expiresAt: null } }));

      expect(await run(PromoStore.byId(row.id))).toMatchObject({
        code: "SUMMER25",
        expiresAt: null,
        discount: "20% off",
        terms: "orders over £50",
        merchant: "Zara",
        // The copy of the mail is a record, not a guess: a patch never touches it.
        subject: COPY.subject,
        bodyHtml: COPY.bodyHtml,
      });
    });

    test("a patch that names nothing leaves the row alone", async () => {
      const row = await extract();

      await run(PromoStore.patch({ id: row.id, fields: {} }));

      expect(await run(PromoStore.byId(row.id))).toEqual(row);
    });

    test("a removal reports the row it took, and the id reads null after", async () => {
      const row = await extract();

      expect(await run(PromoStore.remove(row.id))).toBe(1);
      expect(await run(PromoStore.byId(row.id))).toBeNull();
    });

    test("removing an id with no row is 0, not a failure", async () => {
      expect(await run(PromoStore.remove(crypto.randomUUID()))).toBe(0);
    });

    test("a removal takes one row only", async () => {
      const gone = await extract();
      const kept = await extract();

      await run(PromoStore.remove(gone.id));

      expect(await run(PromoStore.byId(kept.id))).not.toBeNull();
    });

    /**
     * What re-asking needs (#165). Two rules, and the second is the one that
     * would be expensive to get wrong: a manual run replaces the model's last
     * guess about a mail, and never a promo the user chose to keep — the saved
     * row carries the only surviving copy of a mail the save trashed.
     */
    test("clearing a message's unsaved rows takes all of them, and reports how many", async () => {
      const ref = await world.message({ accountId, internalDate: IN_WINDOW });
      const rows = await run(
        PromoStore.insert([
          { ...ref, code: "A", discount: "10% off", terms: null, expiresAt: null, merchant: null },
          { ...ref, code: "B", discount: "£5 off", terms: null, expiresAt: null, merchant: null },
        ]),
      );

      expect(await run(PromoStore.removeUnsavedForMessage(ref))).toBe(2);
      for (const row of rows) {
        expect(await run(PromoStore.byId(row.id))).toBeNull();
      }
    });

    test("clearing leaves a saved row on the same message alone", async () => {
      const ref = await world.message({ accountId, internalDate: IN_WINDOW });
      const [keep, drop] = await run(
        PromoStore.insert([
          {
            ...ref,
            code: "KEPT",
            discount: "10% off",
            terms: null,
            expiresAt: null,
            merchant: null,
          },
          { ...ref, code: "OLD", discount: "£5 off", terms: null, expiresAt: null, merchant: null },
        ]),
      );
      await run(
        PromoStore.markSaved({
          id: keep.id,
          savedAt: new Date("2026-06-16T10:00:00.000Z"),
          message: COPY,
        }),
      );

      expect(await run(PromoStore.removeUnsavedForMessage(ref))).toBe(1);
      expect(await run(PromoStore.byId(keep.id))).not.toBeNull();
      expect(await run(PromoStore.byId(drop.id))).toBeNull();
    });

    test("clearing one message's rows leaves another message's alone", async () => {
      const mine = await extract();
      const other = await extract();

      await run(
        PromoStore.removeUnsavedForMessage({
          accountId: mine.accountId,
          gmailMessageId: mine.gmailMessageId,
        }),
      );

      expect(await run(PromoStore.byId(mine.id))).toBeNull();
      expect(await run(PromoStore.byId(other.id))).not.toBeNull();
    });

    test("clearing a message with no detections is 0, not a failure", async () => {
      const ref = await world.message({ accountId, internalDate: IN_WINDOW });

      expect(await run(PromoStore.removeUnsavedForMessage(ref))).toBe(0);
    });
  });
}
