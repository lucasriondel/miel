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
import {
  ContactStore,
  MessageStore,
  OutboxStore,
  PromoStore,
  SecretStore,
  SettingsStore,
  type NewScheduledSend,
} from "../stores/contracts";

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
      expect(await run(SettingsStore.use((svc) => svc.read(freshKey("missing"))))).toBeNull();
    });

    test("reads back the value it was given", async () => {
      const key = freshKey("readback");
      await run(SettingsStore.use((svc) => svc.write(key, "7d")));
      expect(await run(SettingsStore.use((svc) => svc.read(key)))).toBe("7d");
    });

    test("a second write to a key replaces the first, rather than adding a row", async () => {
      const key = freshKey("upsert");
      await run(SettingsStore.use((svc) => svc.write(key, "a")));
      await run(SettingsStore.use((svc) => svc.write(key, "b")));
      expect(await run(SettingsStore.use((svc) => svc.read(key)))).toBe("b");
    });

    test("keys do not see each other", async () => {
      const [one, two] = [freshKey("one"), freshKey("two")];
      await run(SettingsStore.use((svc) => svc.write(one, "1")));
      expect(await run(SettingsStore.use((svc) => svc.read(two)))).toBeNull();
      await run(SettingsStore.use((svc) => svc.write(two, "2")));
      expect(await run(SettingsStore.use((svc) => svc.read(one)))).toBe("1");
    });

    test.each(VERBATIM)("stores %j verbatim", async (value) => {
      const key = freshKey("verbatim");
      await run(SettingsStore.use((svc) => svc.write(key, value)));
      expect(await run(SettingsStore.use((svc) => svc.read(key)))).toBe(value);
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
      expect(await run(SecretStore.use((svc) => svc.read(freshKey("missing"))))).toBeNull();
    });

    test("reads back the ciphertext it was given", async () => {
      const name = freshKey("readback");
      await run(SecretStore.use((svc) => svc.write(name, "iv:tag:cipher")));
      expect(await run(SecretStore.use((svc) => svc.read(name)))).toBe("iv:tag:cipher");
    });

    test("a second write to a name replaces the ciphertext", async () => {
      const name = freshKey("upsert");
      await run(SecretStore.use((svc) => svc.write(name, "iv:tag:first")));
      await run(SecretStore.use((svc) => svc.write(name, "iv:tag:second")));
      expect(await run(SecretStore.use((svc) => svc.read(name)))).toBe("iv:tag:second");
    });

    test("names do not see each other", async () => {
      const [one, two] = [freshKey("one"), freshKey("two")];
      await run(SecretStore.use((svc) => svc.write(one, "iv:tag:one")));
      expect(await run(SecretStore.use((svc) => svc.read(two)))).toBeNull();
      await run(SecretStore.use((svc) => svc.write(two, "iv:tag:two")));
      expect(await run(SecretStore.use((svc) => svc.read(one)))).toBe("iv:tag:one");
    });

    test("a removal reports the row it took, and the name reads null after", async () => {
      const name = freshKey("remove");
      await run(SecretStore.use((svc) => svc.write(name, "iv:tag:cipher")));
      expect(await run(SecretStore.use((svc) => svc.remove(name)))).toBe(1);
      expect(await run(SecretStore.use((svc) => svc.read(name)))).toBeNull();
    });

    test("removing a name with no row is 0, not a failure", async () => {
      expect(await run(SecretStore.use((svc) => svc.remove(freshKey("never-stored"))))).toBe(0);
    });

    test("a removal takes one name only", async () => {
      const [gone, kept] = [freshKey("gone"), freshKey("kept")];
      await run(SecretStore.use((svc) => svc.write(gone, "iv:tag:gone")));
      await run(SecretStore.use((svc) => svc.write(kept, "iv:tag:kept")));
      await run(SecretStore.use((svc) => svc.remove(gone)));
      expect(await run(SecretStore.use((svc) => svc.read(kept)))).toBe("iv:tag:kept");
    });

    test.each(VERBATIM)("stores %j verbatim", async (ciphertext) => {
      const name = freshKey("verbatim");
      await run(SecretStore.use((svc) => svc.write(name, ciphertext)));
      expect(await run(SecretStore.use((svc) => svc.read(name)))).toBe(ciphertext);
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
        PromoStore.use((svc) =>
          svc.insert([
            {
              ...ref,
              code: fields?.code === undefined ? "SUMMER20" : fields.code,
              discount: fields?.discount ?? "20% off",
              terms: fields?.terms === undefined ? "orders over £50" : fields.terms,
              expiresAt:
                fields?.expiresAt === undefined ? endOfDay("2026-06-30") : fields.expiresAt,
              merchant: fields?.merchant === undefined ? "Zara" : fields.merchant,
            },
          ]),
        ),
      );
      return row;
    };

    const suggestions = () => run(PromoStore.use((svc) => svc.unsaved({ accountId, ...WINDOW })));
    const savedById = async (id: string) =>
      (await run(PromoStore.use((svc) => svc.saved()))).filter((r) => r.id === id);

    test("answers null — not undefined — for an id with no row", async () => {
      expect(await run(PromoStore.use((svc) => svc.byId(crypto.randomUUID())))).toBeNull();
    });

    test("hands back what it inserted, with an id and in the unsaved state", async () => {
      const row = await extract();

      expect(row.id).toBeTruthy();
      expect(row.savedAt).toBeNull();
      expect(await run(PromoStore.use((svc) => svc.byId(row.id)))).toEqual(row);
    });

    test("stores the five extracted fields byte for byte", async () => {
      const row = await extract({
        code: "µ nordic ø — 日本語",
        discount: " 20 % ",
        terms: "x".repeat(4096),
        merchant: "",
      });

      const stored = await run(PromoStore.use((svc) => svc.byId(row.id)));
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
      expect((await run(PromoStore.use((svc) => svc.byId(row.id))))?.expiresAt).toEqual(expiresAt);
      expect(expiresAt.toISOString()).toBe("2026-12-25T23:59:59.999Z");
    });

    test("keeps the nullable fields null rather than defaulting them", async () => {
      const row = await extract({ code: null, terms: null, expiresAt: null, merchant: null });

      expect(await run(PromoStore.use((svc) => svc.byId(row.id)))).toMatchObject({
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
        PromoStore.use((svc) =>
          svc.insert([
            {
              ...ref,
              code: "A",
              discount: "10% off",
              terms: null,
              expiresAt: null,
              merchant: null,
            },
            { ...ref, code: "B", discount: "£5 off", terms: null, expiresAt: null, merchant: null },
          ]),
        ),
      );

      expect(rows.map((r) => r.code).toSorted()).toEqual(["A", "B"]);
      expect(await run(PromoStore.use((svc) => svc.insert([])))).toEqual([]);
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

    test("suggests every account's unsaved rows when no account is named", async () => {
      const second = await world.account();
      const mine = await extract();
      const theirs = await extract({ accountId: second.id });
      const outside = await extract({ internalDate: new Date("2026-07-01T09:00:00.000Z") });

      const rows = (await run(PromoStore.use((svc) => svc.unsaved({})))).filter((r) =>
        [mine.id, theirs.id, outside.id].includes(r.id),
      );

      // No account and no window: the Promo Codes page is global and asks for
      // every detection, which is where the ones the inbox's cap left out live.
      expect(rows.map((r) => r.id).toSorted()).toEqual([mine.id, theirs.id, outside.id].toSorted());
      // Each row names *its own* mailbox, the way a saved one does — the page
      // shows it as a column, so it is part of what the row is.
      expect(rows.find((r) => r.id === theirs.id)?.accountEmail).toBe(second.email);
      expect(rows.find((r) => r.id === mine.id)?.accountEmail).toBe(accountEmail);
    });

    // A "To review" card shows the mail a detection came from. The suggestion
    // has no copy of it — that is the save's — but its mail is in the inbox by
    // this read's own rule, so the join names it, metadata only.
    test("names the mail each suggestion came from, without taking a copy", async () => {
      const row = await extract();

      const [suggested] = (await suggestions()).filter((r) => r.id === row.id);
      expect(suggested.mail.internalDate.toISOString()).toBe(IN_WINDOW.toISOString());
      expect(typeof suggested.mail.fromEmail).toBe("string");
      expect(suggested).not.toHaveProperty("mail.bodyHtml");
      // The copy columns are still the save's to write.
      expect(suggested.subject).toBeNull();
      expect(suggested.internalDate).toBeNull();
    });

    test("stops suggesting a detection whose message left the inbox", async () => {
      const trashed = await extract({ isTrashed: true });

      expect((await suggestions()).map((r) => r.id)).not.toContain(trashed.id);
    });

    test("a saved row leaves the suggestions and joins the saved ones", async () => {
      const row = await extract();
      const savedAt = new Date("2026-06-16T10:00:00.000Z");

      await run(PromoStore.use((svc) => svc.markSaved({ id: row.id, savedAt, message: COPY })));

      expect((await suggestions()).map((r) => r.id)).not.toContain(row.id);
      // …carrying the mailbox it arrived in, which is a column on the page and
      // therefore part of what a saved row *is* (#162).
      expect(await savedById(row.id)).toEqual([{ ...row, savedAt, ...COPY, accountEmail }]);
    });

    test("saving writes the copy of the mail, and saving again updates that one row", async () => {
      const row = await extract();
      const first = new Date("2026-06-16T10:00:00.000Z");
      const second = new Date("2026-06-17T10:00:00.000Z");

      await run(
        PromoStore.use((svc) => svc.markSaved({ id: row.id, savedAt: first, message: COPY })),
      );
      await run(
        PromoStore.use((svc) =>
          svc.markSaved({
            id: row.id,
            savedAt: second,
            message: { ...COPY, subject: null, bodyHtml: null },
          }),
        ),
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
        PromoStore.use((svc) =>
          svc.markSaved({
            id: older.id,
            savedAt: new Date("2026-06-16T10:00:00.000Z"),
            message: COPY,
          }),
        ),
      );
      await run(
        PromoStore.use((svc) =>
          svc.markSaved({
            id: newer.id,
            savedAt: new Date("2026-06-18T10:00:00.000Z"),
            message: COPY,
          }),
        ),
      );

      const rows = (await run(PromoStore.use((svc) => svc.saved()))).filter((r) =>
        [older.id, newer.id].includes(r.id),
      );
      expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
      // Each row names *its own* mailbox, not the first one the read found.
      expect(rows.map((r) => r.accountEmail)).toEqual([second.email, accountEmail]);
    });

    test("a patch writes the fields it names and leaves the rest as stored", async () => {
      const row = await extract();
      await run(
        PromoStore.use((svc) =>
          svc.markSaved({
            id: row.id,
            savedAt: new Date("2026-06-16T10:00:00.000Z"),
            message: COPY,
          }),
        ),
      );

      await run(
        PromoStore.use((svc) =>
          svc.patch({ id: row.id, fields: { code: "SUMMER25", expiresAt: null } }),
        ),
      );

      expect(await run(PromoStore.use((svc) => svc.byId(row.id)))).toMatchObject({
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

      await run(PromoStore.use((svc) => svc.patch({ id: row.id, fields: {} })));

      expect(await run(PromoStore.use((svc) => svc.byId(row.id)))).toEqual(row);
    });

    test("a removal reports the row it took, and the id reads null after", async () => {
      const row = await extract();

      expect(await run(PromoStore.use((svc) => svc.remove(row.id)))).toBe(1);
      expect(await run(PromoStore.use((svc) => svc.byId(row.id)))).toBeNull();
    });

    test("removing an id with no row is 0, not a failure", async () => {
      expect(await run(PromoStore.use((svc) => svc.remove(crypto.randomUUID())))).toBe(0);
    });

    test("a removal takes one row only", async () => {
      const gone = await extract();
      const kept = await extract();

      await run(PromoStore.use((svc) => svc.remove(gone.id)));

      expect(await run(PromoStore.use((svc) => svc.byId(kept.id)))).not.toBeNull();
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
        PromoStore.use((svc) =>
          svc.insert([
            {
              ...ref,
              code: "A",
              discount: "10% off",
              terms: null,
              expiresAt: null,
              merchant: null,
            },
            { ...ref, code: "B", discount: "£5 off", terms: null, expiresAt: null, merchant: null },
          ]),
        ),
      );

      expect(await run(PromoStore.use((svc) => svc.removeUnsavedForMessage(ref)))).toBe(2);
      for (const row of rows) {
        expect(await run(PromoStore.use((svc) => svc.byId(row.id)))).toBeNull();
      }
    });

    test("clearing leaves a saved row on the same message alone", async () => {
      const ref = await world.message({ accountId, internalDate: IN_WINDOW });
      const [keep, drop] = await run(
        PromoStore.use((svc) =>
          svc.insert([
            {
              ...ref,
              code: "KEPT",
              discount: "10% off",
              terms: null,
              expiresAt: null,
              merchant: null,
            },
            {
              ...ref,
              code: "OLD",
              discount: "£5 off",
              terms: null,
              expiresAt: null,
              merchant: null,
            },
          ]),
        ),
      );
      await run(
        PromoStore.use((svc) =>
          svc.markSaved({
            id: keep.id,
            savedAt: new Date("2026-06-16T10:00:00.000Z"),
            message: COPY,
          }),
        ),
      );

      expect(await run(PromoStore.use((svc) => svc.removeUnsavedForMessage(ref)))).toBe(1);
      expect(await run(PromoStore.use((svc) => svc.byId(keep.id)))).not.toBeNull();
      expect(await run(PromoStore.use((svc) => svc.byId(drop.id)))).toBeNull();
    });

    test("clearing one message's rows leaves another message's alone", async () => {
      const mine = await extract();
      const other = await extract();

      await run(
        PromoStore.use((svc) =>
          svc.removeUnsavedForMessage({
            accountId: mine.accountId,
            gmailMessageId: mine.gmailMessageId,
          }),
        ),
      );

      expect(await run(PromoStore.use((svc) => svc.byId(mine.id)))).toBeNull();
      expect(await run(PromoStore.use((svc) => svc.byId(other.id)))).not.toBeNull();
    });

    test("clearing a message with no detections is 0, not a failure", async () => {
      const ref = await world.message({ accountId, internalDate: IN_WINDOW });

      expect(await run(PromoStore.use((svc) => svc.removeUnsavedForMessage(ref)))).toBe(0);
    });
  });
}

/**
 * The world the mailbox's newer operations need (nicknames, snoozes): a
 * `MessageStore` and an account with a message in it, created the way that
 * adapter stores them.
 */
export interface MailboxWorld {
  readonly layer: Layer.Layer<MessageStore>;
  readonly account: () => Promise<{ id: string; email: string }>;
  readonly message: (args: {
    accountId: string;
    internalDate: Date;
    isArchived?: boolean;
  }) => Promise<{ accountId: string; gmailMessageId: string; gmailThreadId: string }>;
}

/**
 * Nicknames and snoozes on the {@link MessageStore}. A snooze is joined onto the
 * list by thread, which is the part a Map and a SQL join could disagree on: the
 * Snoozed view, and the Done view that must not show a snoozed thread.
 */
export function mailboxSnoozeContract(label: string, worldFor: () => Promise<MailboxWorld>): void {
  describe(`${label} satisfies the MessageStore nickname and snooze contract`, () => {
    let world: MailboxWorld;
    let accountId: string;
    let run = <A>(eff: Effect.Effect<A, never, MessageStore>): Promise<A> =>
      Effect.runPromise(Effect.provide(eff, world.layer));

    beforeEach(async () => {
      world = await worldFor();
      ({ id: accountId } = await world.account());
      run = (eff) => Effect.runPromise(Effect.provide(eff, world.layer));
    });

    const WAKE = new Date("2026-06-20T08:00:00.000Z");

    test("a nickname is set, read back on the account, and cleared with null", async () => {
      expect(
        await run(MessageStore.use((s) => s.setNickname({ id: accountId, nickname: "Pro" }))),
      ).toBe(1);
      expect((await run(MessageStore.use((s) => s.accountById(accountId))))?.nickname).toBe("Pro");
      await run(MessageStore.use((s) => s.setNickname({ id: accountId, nickname: null })));
      expect((await run(MessageStore.use((s) => s.accountById(accountId))))?.nickname).toBeNull();
    });

    test("naming an unknown account sets nothing", async () => {
      expect(
        await run(
          MessageStore.use((s) =>
            s.setNickname({ id: "00000000-0000-4000-8000-000000000000", nickname: "x" }),
          ),
        ),
      ).toBe(0);
    });

    test("a snoozed thread is listed as snoozed, and not in Done", async () => {
      const m = await world.message({ accountId, internalDate: IN_WINDOW, isArchived: true });
      const done = await world.message({ accountId, internalDate: IN_WINDOW, isArchived: true });
      await run(MessageStore.use((s) => s.snooze({ ...m, wakeAt: WAKE })));

      const snoozed = await run(
        MessageStore.use((s) => s.list({ accountId, snoozedOnly: true, limit: 50 })),
      );
      expect(snoozed.map((r) => r.gmailMessageId)).toEqual([m.gmailMessageId]);
      expect(snoozed[0].snoozedUntil?.toISOString()).toBe(WAKE.toISOString());

      const doneView = await run(
        MessageStore.use((s) => s.list({ accountId, archivedOnly: true, limit: 50 })),
      );
      expect(doneView.map((r) => r.gmailMessageId)).toEqual([done.gmailMessageId]);
      expect(doneView[0].snoozedUntil).toBeNull();

      const detail = await run(MessageStore.use((s) => s.detail(m)));
      expect(detail?.snoozedUntil?.toISOString()).toBe(WAKE.toISOString());
    });

    test("snoozing a snoozed thread again moves its wake time rather than adding a row", async () => {
      const m = await world.message({ accountId, internalDate: IN_WINDOW, isArchived: true });
      const later = new Date("2026-06-21T08:00:00.000Z");
      await run(MessageStore.use((s) => s.snooze({ ...m, wakeAt: WAKE })));
      await run(MessageStore.use((s) => s.snooze({ ...m, wakeAt: later })));

      const rows = await run(
        MessageStore.use((s) => s.list({ accountId, snoozedOnly: true, limit: 50 })),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].snoozedUntil?.toISOString()).toBe(later.toISOString());
    });

    test("due snoozes are the ones whose wake time has come, soonest first, with the email", async () => {
      const early = await world.message({ accountId, internalDate: IN_WINDOW, isArchived: true });
      const late = await world.message({ accountId, internalDate: IN_WINDOW, isArchived: true });
      const future = await world.message({ accountId, internalDate: IN_WINDOW, isArchived: true });
      await run(
        MessageStore.use((s) => s.snooze({ ...late, wakeAt: new Date("2026-06-20T09:00:00Z") })),
      );
      await run(
        MessageStore.use((s) => s.snooze({ ...early, wakeAt: new Date("2026-06-20T07:00:00Z") })),
      );
      await run(
        MessageStore.use((s) => s.snooze({ ...future, wakeAt: new Date("2030-01-01T00:00:00Z") })),
      );

      const due = (
        await run(
          MessageStore.use((s) =>
            s.dueSnoozes({ now: new Date("2026-06-20T10:00:00Z"), limit: 1000 }),
          ),
        )
      ).filter((d) => d.accountId === accountId);
      expect(due.map((d) => d.gmailThreadId)).toEqual([early.gmailThreadId, late.gmailThreadId]);
      expect(due[0].accountEmail).toContain("@");
    });

    test("an unsnooze reports the row it took, and the thread is no longer snoozed", async () => {
      const m = await world.message({ accountId, internalDate: IN_WINDOW, isArchived: true });
      await run(MessageStore.use((s) => s.snooze({ ...m, wakeAt: WAKE })));
      expect(await run(MessageStore.use((s) => s.unsnooze(m)))).toBe(1);
      expect(await run(MessageStore.use((s) => s.unsnooze(m)))).toBe(0);
      expect((await run(MessageStore.use((s) => s.detail(m))))?.snoozedUntil).toBeNull();
    });
  });
}

/** The outbox's world: a store and an account its rows belong to. */
export interface AccountWorld<S> {
  readonly layer: Layer.Layer<S>;
  readonly account: () => Promise<{ id: string; email: string }>;
}

/** Run the {@link OutboxStore} contract against `worldFor()`, called once per test. */
export function outboxStoreContract(
  label: string,
  worldFor: () => Promise<AccountWorld<OutboxStore>>,
): void {
  describe(`${label} satisfies the OutboxStore contract`, () => {
    let world: AccountWorld<OutboxStore>;
    let accountId: string;
    let run = <A>(eff: Effect.Effect<A, never, OutboxStore>): Promise<A> =>
      Effect.runPromise(Effect.provide(eff, world.layer));

    beforeEach(async () => {
      world = await worldFor();
      ({ id: accountId } = await world.account());
      run = (eff) => Effect.runPromise(Effect.provide(eff, world.layer));
    });

    const BYTES = new Uint8Array([0, 1, 2, 250, 255, 10, 13]);
    const scheduledRow = (over?: Partial<NewScheduledSend>): NewScheduledSend => ({
      accountId,
      kind: "new",
      sourceGmailMessageId: null,
      payload: { to: ["claire@example.com"], subject: "Dinner", body: "9pm?" },
      messageIdHeader: `<${crypto.randomUUID()}@miel>`,
      sendAt: new Date("2026-06-20T08:00:00.000Z"),
      ...over,
    });

    test("an upload is answered without its bytes, and read back with them byte for byte", async () => {
      const stored = await run(
        OutboxStore.use((s) =>
          s.putUpload({
            accountId,
            filename: "Quote µ.pdf",
            mimeType: "application/pdf",
            data: BYTES,
          }),
        ),
      );
      expect(stored.size).toBe(BYTES.byteLength);
      expect("data" in stored).toBe(false);

      const [read] = await run(
        OutboxStore.use((s) => s.uploadsByIds({ accountId, ids: [stored.id] })),
      );
      expect(read.filename).toBe("Quote µ.pdf");
      expect([...read.data]).toEqual([...BYTES]);
    });

    test("another account cannot read or remove an upload", async () => {
      const other = await world.account();
      const stored = await run(
        OutboxStore.use((s) =>
          s.putUpload({ accountId, filename: "a", mimeType: "text/plain", data: BYTES }),
        ),
      );
      expect(
        await run(
          OutboxStore.use((s) => s.uploadsByIds({ accountId: other.id, ids: [stored.id] })),
        ),
      ).toEqual([]);
      expect(
        await run(OutboxStore.use((s) => s.removeUpload({ accountId: other.id, id: stored.id }))),
      ).toBe(0);
      expect(await run(OutboxStore.use((s) => s.removeUpload({ accountId, id: stored.id })))).toBe(
        1,
      );
    });

    test("the sweep keeps an upload a pending scheduled send still names", async () => {
      const kept = await run(
        OutboxStore.use((s) =>
          s.putUpload({ accountId, filename: "k", mimeType: "text/plain", data: BYTES }),
        ),
      );
      const swept = await run(
        OutboxStore.use((s) =>
          s.putUpload({ accountId, filename: "s", mimeType: "text/plain", data: BYTES }),
        ),
      );
      await run(
        OutboxStore.use((s) =>
          s.schedule(
            scheduledRow({
              payload: { to: ["a@b.c"], subject: "", body: "x", uploadIds: [kept.id] },
            }),
          ),
        ),
      );
      await run(OutboxStore.use((s) => s.sweepUploads(new Date(Date.now() + 60_000))));

      const left = await run(
        OutboxStore.use((s) => s.uploadsByIds({ accountId, ids: [kept.id, swept.id] })),
      );
      expect(left.map((u) => u.id)).toEqual([kept.id]);
    });

    test("a scheduled send starts pending, and cancelling it only works while pending", async () => {
      const row = await run(OutboxStore.use((s) => s.schedule(scheduledRow())));
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(0);
      expect(row.payload).toEqual({ to: ["claire@example.com"], subject: "Dinner", body: "9pm?" });

      expect(await run(OutboxStore.use((s) => s.cancelScheduled(row.id)))).toBe(1);
      expect(await run(OutboxStore.use((s) => s.cancelScheduled(row.id)))).toBe(0);
      expect((await run(OutboxStore.use((s) => s.scheduledById(row.id))))?.status).toBe(
        "cancelled",
      );
    });

    test("only due pending rows are claimed, once, and a claim counts an attempt", async () => {
      const due = await run(OutboxStore.use((s) => s.schedule(scheduledRow())));
      const later = await run(
        OutboxStore.use((s) =>
          s.schedule(scheduledRow({ sendAt: new Date("2030-01-01T00:00:00Z") })),
        ),
      );
      const now = new Date("2026-06-20T09:00:00.000Z");
      const claim = () =>
        run(OutboxStore.use((s) => s.claimDue({ now, staleBefore: new Date(0), limit: 1000 })));

      const first = (await claim()).filter((r) => r.id === due.id || r.id === later.id);
      expect(first.map((r) => r.id)).toEqual([due.id]);
      expect(first[0]).toMatchObject({ status: "sending", attempts: 1 });
      expect(first[0].claimedAt?.toISOString()).toBe(now.toISOString());

      const second = (await claim()).filter((r) => r.id === due.id);
      expect(second).toEqual([]);
    });

    test("a send left in flight past the grace period is claimed again", async () => {
      const row = await run(OutboxStore.use((s) => s.schedule(scheduledRow())));
      const t1 = new Date("2026-06-20T09:00:00.000Z");
      await run(
        OutboxStore.use((s) => s.claimDue({ now: t1, staleBefore: new Date(0), limit: 1000 })),
      );

      const t2 = new Date("2026-06-20T09:20:00.000Z");
      const again = (
        await run(
          OutboxStore.use((s) =>
            s.claimDue({ now: t2, staleBefore: new Date("2026-06-20T09:10:00.000Z"), limit: 1000 }),
          ),
        )
      ).filter((r) => r.id === row.id);
      expect(again).toHaveLength(1);
      expect(again[0].attempts).toBe(2);
    });

    test("finishing records sent, failed or a retry, and only from sending", async () => {
      const a = await run(OutboxStore.use((s) => s.schedule(scheduledRow())));
      const b = await run(OutboxStore.use((s) => s.schedule(scheduledRow())));
      const c = await run(OutboxStore.use((s) => s.schedule(scheduledRow())));
      const now = new Date("2026-06-20T09:00:00.000Z");
      await run(OutboxStore.use((s) => s.claimDue({ now, staleBefore: new Date(0), limit: 1000 })));

      await run(
        OutboxStore.use((s) =>
          s.finishScheduled({
            id: a.id,
            outcome: { kind: "sent", sentAt: now, sentMessageId: "m1", threadId: "t1" },
          }),
        ),
      );
      await run(
        OutboxStore.use((s) =>
          s.finishScheduled({ id: b.id, outcome: { kind: "failed", error: "Invalid To header" } }),
        ),
      );
      const retryAt = new Date("2026-06-20T09:05:00.000Z");
      await run(
        OutboxStore.use((s) =>
          s.finishScheduled({
            id: c.id,
            outcome: { kind: "retry", sendAt: retryAt, error: "timeout" },
          }),
        ),
      );

      const [ra, rb, rc] = await Promise.all(
        [a, b, c].map((r) => run(OutboxStore.use((s) => s.scheduledById(r.id)))),
      );
      expect(ra).toMatchObject({ status: "sent", sentMessageId: "m1", threadId: "t1" });
      expect(rb).toMatchObject({ status: "failed", error: "Invalid To header" });
      expect(rc).toMatchObject({ status: "pending", error: "timeout" });
      expect(rc?.sendAt.toISOString()).toBe(retryAt.toISOString());

      // A sent row is not sending any more, so a late second finish changes nothing.
      await run(
        OutboxStore.use((s) =>
          s.finishScheduled({ id: a.id, outcome: { kind: "failed", error: "late" } }),
        ),
      );
      expect((await run(OutboxStore.use((s) => s.scheduledById(a.id))))?.status).toBe("sent");
    });

    test("rescheduling moves a pending or failed send and clears its error", async () => {
      const row = await run(OutboxStore.use((s) => s.schedule(scheduledRow())));
      await run(
        OutboxStore.use((s) =>
          s.claimDue({
            now: new Date("2026-06-20T09:00:00Z"),
            staleBefore: new Date(0),
            limit: 1000,
          }),
        ),
      );
      await run(
        OutboxStore.use((s) =>
          s.finishScheduled({ id: row.id, outcome: { kind: "failed", error: "x" } }),
        ),
      );

      const at = new Date("2026-07-01T08:00:00.000Z");
      expect(await run(OutboxStore.use((s) => s.reschedule({ id: row.id, sendAt: at })))).toBe(1);
      const moved = await run(OutboxStore.use((s) => s.scheduledById(row.id)));
      expect(moved).toMatchObject({ status: "pending", error: null, attempts: 0 });
      expect(moved?.sendAt.toISOString()).toBe(at.toISOString());

      await run(OutboxStore.use((s) => s.cancelScheduled(row.id)));
      expect(await run(OutboxStore.use((s) => s.reschedule({ id: row.id, sendAt: at })))).toBe(0);
    });

    test("the list is one account's rows in the named states, soonest first", async () => {
      const late = await run(
        OutboxStore.use((s) =>
          s.schedule(scheduledRow({ sendAt: new Date("2026-06-22T08:00:00Z") })),
        ),
      );
      const soon = await run(
        OutboxStore.use((s) =>
          s.schedule(scheduledRow({ sendAt: new Date("2026-06-21T08:00:00Z") })),
        ),
      );
      const gone = await run(OutboxStore.use((s) => s.schedule(scheduledRow())));
      await run(OutboxStore.use((s) => s.cancelScheduled(gone.id)));

      const rows = await run(
        OutboxStore.use((s) => s.scheduledList({ accountId, statuses: ["pending"] })),
      );
      expect(rows.map((r) => r.id)).toEqual([soon.id, late.id]);
    });
  });
}

const at = (iso: string) => new Date(iso);

/** Run the {@link ContactStore} contract against `worldFor()`, called once per test. */
export function contactStoreContract(
  label: string,
  worldFor: () => Promise<AccountWorld<ContactStore>>,
): void {
  describe(`${label} satisfies the ContactStore contract`, () => {
    let world: AccountWorld<ContactStore>;
    let accountId: string;
    let run = <A>(eff: Effect.Effect<A, never, ContactStore>): Promise<A> =>
      Effect.runPromise(Effect.provide(eff, world.layer));

    beforeEach(async () => {
      world = await worldFor();
      ({ id: accountId } = await world.account());
      run = (eff) => Effect.runPromise(Effect.provide(eff, world.layer));
    });

    test("one person is one row, whatever the case of the address", async () => {
      await run(
        ContactStore.use((s) =>
          s.record([
            {
              accountId,
              email: "Claire@Example.com",
              name: null,
              contactedAt: at("2026-06-01T10:00:00Z"),
            },
            {
              accountId,
              email: "claire@example.com",
              name: "Claire Martin",
              contactedAt: at("2026-06-02T10:00:00Z"),
            },
          ]),
        ),
      );
      const rows = await run(
        ContactStore.use((s) => s.search({ accountId, query: "", limit: 10 })),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ email: "claire@example.com", name: "Claire Martin" });
    });

    test("a newer sighting counts; the same send seen again does not", async () => {
      const sighting = {
        accountId,
        email: "a@example.com",
        name: null,
        contactedAt: at("2026-06-01T10:00:00Z"),
      };
      await run(ContactStore.use((s) => s.record([sighting])));
      await run(ContactStore.use((s) => s.record([sighting])));
      await run(
        ContactStore.use((s) =>
          s.record([{ ...sighting, contactedAt: at("2026-06-03T10:00:00Z") }]),
        ),
      );

      const [row] = await run(
        ContactStore.use((s) => s.search({ accountId, query: "a@", limit: 10 })),
      );
      expect(row.timesContacted).toBe(2);
      expect(row.lastContactedAt.toISOString()).toBe("2026-06-03T10:00:00.000Z");
    });

    test("search matches address or name, case-insensitively, most contacted first", async () => {
      await run(
        ContactStore.use((s) =>
          s.record([
            {
              accountId,
              email: "claire.martin@example.com",
              name: "Claire Martin",
              contactedAt: at("2026-06-01T10:00:00Z"),
            },
            {
              accountId,
              email: "clarisse@example.org",
              name: null,
              contactedAt: at("2026-06-05T10:00:00Z"),
            },
            {
              accountId,
              email: "bob@example.com",
              name: "Bob",
              contactedAt: at("2026-06-05T10:00:00Z"),
            },
          ]),
        ),
      );
      await run(
        ContactStore.use((s) =>
          s.record([
            {
              accountId,
              email: "claire.martin@example.com",
              name: null,
              contactedAt: at("2026-06-02T10:00:00Z"),
            },
          ]),
        ),
      );

      const hits = await run(
        ContactStore.use((s) => s.search({ accountId, query: "CLA", limit: 10 })),
      );
      expect(hits.map((h) => h.email)).toEqual([
        "claire.martin@example.com",
        "clarisse@example.org",
      ]);
      const byName = await run(
        ContactStore.use((s) => s.search({ accountId, query: "martin", limit: 10 })),
      );
      expect(byName.map((h) => h.email)).toEqual(["claire.martin@example.com"]);
      const capped = await run(
        ContactStore.use((s) => s.search({ accountId, query: "", limit: 1 })),
      );
      expect(capped).toHaveLength(1);
    });

    test("a percent sign in the query is a character, not a wildcard", async () => {
      await run(
        ContactStore.use((s) =>
          s.record([
            {
              accountId,
              email: "x@example.com",
              name: null,
              contactedAt: at("2026-06-01T10:00:00Z"),
            },
          ]),
        ),
      );
      expect(
        await run(ContactStore.use((s) => s.search({ accountId, query: "%", limit: 10 }))),
      ).toEqual([]);
    });

    test("accounts do not see each other's contacts", async () => {
      const other = await world.account();
      await run(
        ContactStore.use((s) =>
          s.record([
            {
              accountId,
              email: "x@example.com",
              name: null,
              contactedAt: at("2026-06-01T10:00:00Z"),
            },
          ]),
        ),
      );
      expect(
        await run(ContactStore.use((s) => s.search({ accountId: other.id, query: "", limit: 10 }))),
      ).toEqual([]);
    });
  });
}
