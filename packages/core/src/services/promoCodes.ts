/**
 * The promo service (#154, #159) — the prefilter call and the extraction, owned
 * in one place so the fetch phase calls it rather than spelling either out.
 *
 * What it does for a sync: take the messages the fetch just upserted, ask
 * {@link shouldExtractPromos} which of them are worth a model call, run
 * `promo-extract` over those, and write one suggested row per promo the model
 * answered with.
 *
 * Three rules the shape here is load-bearing for.
 *
 * **New messages only, once.** The caller hands over what it just fetched;
 * nothing is re-read and nothing is re-extracted. There is deliberately no
 * extraction-attempted marker, because nothing ever asks twice — so "found
 * nothing" and "never asked" are indistinguishable and neither needs recording.
 * The accepted consequence is that the feature is blind to the existing
 * mailbox and fills forward.
 *
 * **One message per model call.** A batch of stripped marketing mails invites
 * the model to attribute one shop's code to another — a silent wrong answer
 * landing in a row the user trusts at a checkout. Cost is controlled by the
 * prefilter, not by batching.
 *
 * **Two classes of failure, and only one of them is ours.** A malformed answer
 * on one marketing mail is logged and skipped so a sync that triaged fine is
 * not lost to it; a provider that cannot run propagates, through the same
 * {@link recoverUnlessProviderUnavailable} triage and filter-suggest use. A
 * third AI call site inventing its own catch is the exact drift #126 fixed.
 */
import { Effect } from "effect";
import { Claude, ClaudeLive } from "../claude/Claude";
import type { ProviderUnavailableError } from "../errors";
import type { GmailDataAdapter } from "../google/gmailAdapter";
import { promoExpiryInstant } from "../promoExpiry";
import type { ExtractedPromoT } from "../schemas/promo";
import {
  MessageStore,
  PromoStore,
  type NewPromoCode,
  type PromoFields,
  type SavedPromoCode,
  type StoredPromoCode,
} from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { htmlToVisibleText } from "../util/htmlText";
import { trashMessageEffect } from "./apply";
import { shouldExtractPromos } from "./promoPrefilter";
import { recoverUnlessProviderUnavailable } from "./sync/providerFailure";

const debug = createDebug("service:promoCodes");

/**
 * How many mails are extracted at once.
 *
 * Each is its own request, so this is the only thing standing between a
 * newsletter-heavy sync and a hundred simultaneous model calls. Kept modest and
 * fixed rather than made a setting: the prefilter is where this feature's cost
 * is controlled, and a second knob would only give an operator a way to make it
 * worse.
 */
const EXTRACT_CONCURRENCY = 4;

/**
 * A fetched message, as this service needs it — deliberately not
 * `NormalizedMessage`, so the service does not depend on the sync module that
 * calls it.
 */
export interface PromoCandidateMessage {
  gmailMessageId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  /** The mail's text/plain part, if it had one. */
  bodyText: string;
  /** The mail's HTML part — where a marketing mail actually keeps its offer. */
  bodyHtml: string;
  internalDate: Date;
}

export interface PromoExtractionResult {
  /** How many of the messages the prefilter thought worth a model call. */
  candidates: number;
  /** Rows written — one per promo the model answered with. */
  extracted: number;
  /** One entry per message whose extraction failed; the phase carried on. */
  errors: string[];
}

export interface ExtractPromosOptions {
  accountId: string;
  accountEmail: string;
  /** The messages the fetch just upserted. */
  messages: readonly PromoCandidateMessage[];
  log?: (msg: string) => void;
}

/**
 * The mail as visible text: the HTML part stripped when there is one, the plain
 * part otherwise.
 *
 * The HTML is preferred because it is where a marketing mail keeps its offer —
 * the text/plain part of one is routinely a "view this in your browser" stub,
 * and a code three screens down inside the HTML is exactly what this feature
 * exists to find. The same string is what the prefilter judges and what the
 * model reads, so the decision and the evidence cannot come apart.
 */
const visibleText = (message: PromoCandidateMessage): string => {
  const fromHtml = message.bodyHtml ? htmlToVisibleText(message.bodyHtml) : "";
  return fromHtml.length > 0 ? fromHtml : message.bodyText;
};

/** The sender as the prompt states it, and as `merchant` falls back to. */
const senderLine = (message: PromoCandidateMessage): string =>
  message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail;

/**
 * A model's answer as a row. The expiry arrives as `YYYY-MM-DD` and is stored at
 * the end of that UTC day ({@link endOfDayUtc}); the merchant falls back to the
 * sender's display name, since a saved promo outlives the mail it came from.
 */
const toRow = (
  accountId: string,
  message: PromoCandidateMessage,
  promo: ExtractedPromoT,
): NewPromoCode => ({
  accountId,
  gmailMessageId: message.gmailMessageId,
  code: promo.code,
  discount: promo.discount,
  terms: promo.terms,
  expiresAt: promo.expiresAt ? promoExpiryInstant(promo.expiresAt) : null,
  merchant: promo.merchant ?? message.fromName,
});

interface OneMessageResult {
  rows: NewPromoCode[];
  errors: string[];
}

/** A message when there is one, the tag when there is not — never nothing. */
const describeFailure = (err: unknown, detail: string): string =>
  detail || (err as { _tag?: string })?._tag || "unknown";

const extractOne = (
  accountId: string,
  message: PromoCandidateMessage,
  text: string,
  log: (msg: string) => void,
): Effect.Effect<OneMessageResult, ProviderUnavailableError, Claude> =>
  Effect.gen(function* () {
    const claude = yield* Claude;
    const { output } = yield* claude.run("promo-extract", {
      from: senderLine(message),
      subject: message.subject,
      receivedAt: message.internalDate.toISOString(),
      body: text,
    });
    return { rows: output.promos.map((p) => toRow(accountId, message, p)), errors: [] };
  }).pipe(
    // Which class a failure is in stays the combinator's answer, not this
    // module's; the original error is kept only to name a failure that carries
    // its specifics in fields rather than in a message, the way syncAll does.
    Effect.catchAll((err) =>
      recoverUnlessProviderUnavailable<OneMessageResult>((detail) => {
        const entry = `promoExtract(${message.gmailMessageId}): ${describeFailure(err, detail)}`;
        log(entry);
        debug.warn("extraction failed", {
          gmailMessageId: message.gmailMessageId,
          error: entry,
        });
        return Effect.succeed<OneMessageResult>({ rows: [], errors: [entry] });
      })(err),
    ),
  );

export const extractPromosForMessagesEffect = (
  opts: ExtractPromosOptions,
): Effect.Effect<PromoExtractionResult, ProviderUnavailableError, Claude | PromoStore> =>
  Effect.gen(function* () {
    const log = opts.log ?? (() => {});

    // The prefilter and the model read the same text, derived once.
    const candidates = opts.messages
      .map((message) => ({ message, text: visibleText(message) }))
      .filter(({ message, text }) => shouldExtractPromos({ subject: message.subject, text }));

    if (candidates.length === 0) {
      debug("no promo candidates", { account: opts.accountEmail });
      return { candidates: 0, extracted: 0, errors: [] };
    }

    log(
      `[${opts.accountEmail}] extracting promos from ${candidates.length} of ${opts.messages.length} new message(s)`,
    );

    const results = yield* Effect.all(
      candidates.map(({ message, text }) => extractOne(opts.accountId, message, text, log)),
      { concurrency: EXTRACT_CONCURRENCY },
    );

    const rows = results.flatMap((r) => r.rows);
    const errors = results.flatMap((r) => r.errors);

    const store = yield* PromoStore;
    yield* store.insert(rows);

    log(`[${opts.accountEmail}] ${rows.length} promo(s) detected`);
    debug.info("promos extracted", {
      account: opts.accountEmail,
      candidates: candidates.length,
      extracted: rows.length,
      failed: errors.length,
    });

    return { candidates: candidates.length, extracted: rows.length, errors };
  });

/* ------------------------------------------------------------------------- *
 * The suggestions the inbox section reads (#160)
 * ------------------------------------------------------------------------- */

/**
 * How many cards the section shows before the rest are the Promo Codes page's
 * problem. A heavy newsletter week must not push the inbox off the screen, and
 * a horizontal strip past half a dozen cards is a list nobody scrolls to the
 * end of.
 */
export const MAX_PROMO_SUGGESTIONS = 6;

/**
 * A suggestion on the wire: the four fields a card shows, the code itself, and
 * the mail it came from — which is what the save (#161) will need to name.
 *
 * The dates are strings because this crosses HTTP; `expiresAt` is the stored
 * end-of-day instant, and the card renders it as a date.
 */
export interface PromoSuggestion {
  id: string;
  accountId: string;
  gmailMessageId: string;
  code: string | null;
  discount: string;
  terms: string | null;
  expiresAt: string | null;
  merchant: string | null;
}

export interface ListPromoSuggestionsArgs {
  accountId: string;
  /** The period the inbox is showing, by the *mail's* date. */
  internalDateFrom?: string;
  internalDateTo?: string;
  /**
   * The instant an expiry is judged against. A parameter rather than a call to
   * the clock so "expired" is assertable; the facade below passes the real one.
   */
  now?: Date;
}

const suggestion = (row: StoredPromoCode): PromoSuggestion => ({
  id: row.id,
  accountId: row.accountId,
  gmailMessageId: row.gmailMessageId,
  code: row.code,
  discount: row.discount,
  terms: row.terms,
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  merchant: row.merchant,
});

/**
 * Still usable: worth a card in the inbox, and above the line on the page.
 *
 * An unstated expiry is not an expired one — the model is told never to guess a
 * date — and the stored instant is the end of the promo's last day, so one
 * lapsing today counts for the whole of it.
 */
const stillValid = (row: StoredPromoCode, now: Date): boolean =>
  row.expiresAt === null || row.expiresAt.getTime() >= now.getTime();

/**
 * One offer, one card. A shop that sends the same code in three reminder mails
 * gets one entry; the store answers newest mail first, so the one kept is the
 * most recent detection.
 *
 * Only a code identifies an offer, so a promo needing none is never folded into
 * another: two "no code needed" offers are two offers, and there is nothing to
 * compare them by that is not a guess.
 */
const distinctByCode = (rows: readonly StoredPromoCode[]): StoredPromoCode[] => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.code === null) return true;
    const key = row.code.trim().toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * What the inbox's suggestions section shows: this account's unsaved detections
 * for the period the list below is showing.
 *
 * Three of the rules are storage's, because they are what the read model is —
 * unsaved only, one account, and the mailbox rule that an unsaved detection
 * whose mail was archived, trashed or removed follows it out. The three here
 * are the section's: an expired promo is not a suggestion, a repeated code is
 * one card, and the section is capped.
 *
 * The period is passed down rather than applied to what a caller already
 * loaded: the message list's payload carries no bodies and therefore no promos,
 * so there is nothing client-side to filter.
 */
export const listPromoSuggestionsEffect = (
  args: ListPromoSuggestionsArgs,
): Effect.Effect<PromoSuggestion[], never, PromoStore> =>
  Effect.gen(function* () {
    const now = args.now ?? new Date();
    const rows = yield* PromoStore.unsaved({
      accountId: args.accountId,
      internalDateFrom: args.internalDateFrom ? new Date(args.internalDateFrom) : undefined,
      internalDateTo: args.internalDateTo ? new Date(args.internalDateTo) : undefined,
    });

    // Dedupe before the cap, so a repeated code cannot spend one of the slots.
    return distinctByCode(rows.filter((row) => stillValid(row, now)))
      .slice(0, MAX_PROMO_SUGGESTIONS)
      .map(suggestion);
  });

// Promise facade for the API/CLI boundary.
export async function listPromoSuggestions(
  args: ListPromoSuggestionsArgs,
): Promise<PromoSuggestion[]> {
  return runWithStores(listPromoSuggestionsEffect(args));
}

/* ------------------------------------------------------------------------- *
 * The Promo Codes page (#162)
 * ------------------------------------------------------------------------- */

/**
 * One saved promo, as the page's rows are.
 *
 * `accountEmail` is a *column*, never a filter: a promo code is a thing used at
 * a checkout, and which mailbox it arrived in is trivia — nobody standing at a
 * till should have to remember it in order to see their codes. So the page is
 * global and the account is information on the row.
 *
 * What is deliberately absent is the copy of the mail. The save denormalised
 * subject, sender, date and both bodies onto the row so a saved promo outlives
 * the Gmail original it trashed; a *list* that carried them would send every
 * saved mail's HTML to draw a table of five short fields. Reading the original
 * is one promo at a time and gets its own read when it lands.
 */
export interface SavedPromo {
  id: string;
  accountId: string;
  /** The mailbox this promo arrived in — shown, never filtered on. */
  accountEmail: string;
  gmailMessageId: string;
  code: string | null;
  discount: string;
  terms: string | null;
  expiresAt: string | null;
  merchant: string | null;
}

/** The page's two sections, each already in the order it is read in. */
export interface SavedPromosPage {
  active: SavedPromo[];
  expired: SavedPromo[];
}

export interface ListSavedPromosArgs {
  /**
   * The instant an expiry is judged against — a parameter rather than a call to
   * the clock, so which section a promo is in is assertable. The facade below
   * passes the real one.
   */
  now?: Date;
}

const savedPromo = (row: SavedPromoCode): SavedPromo => ({
  id: row.id,
  accountId: row.accountId,
  accountEmail: row.accountEmail,
  gmailMessageId: row.gmailMessageId,
  code: row.code,
  discount: row.discount,
  terms: row.terms,
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  merchant: row.merchant,
});

/**
 * Soonest deadline first, with the open-ended offers after every dated one —
 * dated urgency outranks an offer with nothing to run out.
 *
 * Two promos that both state no end are equal, and the sort is stable, so they
 * keep the order the store answered in.
 */
const bySoonest = (a: SavedPromoCode, b: SavedPromoCode): number => {
  if (a.expiresAt === null || b.expiresAt === null) {
    return Number(a.expiresAt === null) - Number(b.expiresAt === null);
  }
  return a.expiresAt.getTime() - b.expiresAt.getTime();
};

/**
 * Every saved promo, in the two sections the page reads them in.
 *
 * The one rule that is storage's is what a saved row is — `savedAt` set, every
 * account, newest saved first, each naming its mailbox. The rest is the page's:
 *
 * - **Active, soonest deadline first.** The page answers "what is about to
 *   lapse" without anyone sorting it. A promo with no stated end sorts last
 *   among them, because dated urgency outranks an open-ended offer — and an
 *   unstated expiry is still not an expired one, since the extraction is told
 *   never to guess a date.
 * - **Expired below, most recently lapsed first**, and *kept*: nothing here
 *   deletes, so the record of what a shop offered stays until the user removes
 *   it themselves. The stored instant is the end of the promo's last UTC day,
 *   so a promo lapsing today is active for the whole of it.
 * - **Nothing is deduped.** The suggestions section folds a shop's repeated
 *   code into one card, because three reminder mails are one offer; two saves
 *   are two decisions the user made, and the page does not overrule them.
 *
 * Both sorts are stable over what the store answered, so promos sharing a
 * deadline stay newest-saved first.
 */
export const listSavedPromosEffect = (
  args: ListSavedPromosArgs = {},
): Effect.Effect<SavedPromosPage, never, PromoStore> =>
  Effect.gen(function* () {
    const now = args.now ?? new Date();
    const rows = yield* PromoStore.saved();

    const active = rows.filter((row) => stillValid(row, now));
    const expired = rows.filter((row) => !stillValid(row, now));

    return {
      active: active.toSorted(bySoonest).map(savedPromo),
      // The same comparator, read backwards: most recently lapsed first. Nothing
      // in here has a null expiry — a promo with no stated end never expires.
      expired: expired.toSorted((a, b) => bySoonest(b, a)).map(savedPromo),
    };
  });

// Promise facade for the API/CLI boundary.
export async function listSavedPromos(args: ListSavedPromosArgs = {}): Promise<SavedPromosPage> {
  return runWithStores(listSavedPromosEffect(args));
}

/* ------------------------------------------------------------------------- *
 * The mail a saved promo came from (#163)
 * ------------------------------------------------------------------------- */

/**
 * The copy of the mail the save took, as the viewer reads it.
 *
 * This is a *record*, not a message: the five extracted fields beside it are
 * the model's guesses and are the only part of a promo anyone may edit, while
 * this is what the mail said. Nothing writes it after the save, and there is no
 * endpoint that could.
 *
 * `internalDate` crosses HTTP as a string, like every other instant here.
 */
export interface SavedPromoMail {
  id: string;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  internalDate: string | null;
  /** What the mail looked like; the viewer renders this when there is one. */
  bodyHtml: string | null;
  /** The stripped text, which is what the viewer falls back to. */
  bodyText: string | null;
}

/**
 * The mail behind one saved promo — read from the promo row's own copy, never
 * from `messages`.
 *
 * That is the whole point of having kept it. The save trashed the Gmail
 * original in the same gesture, Gmail purges its own trash thirty days later,
 * and nothing here re-fetches: the copy outlives both, so the small print is
 * still readable long after the mail is not. A read that resolved the message
 * row instead would answer nothing at exactly the moment this is the only
 * version left.
 *
 * A promo nobody saved has no copy — the columns are written at save time and
 * at no other moment — so it answers the same null an unknown id does, and the
 * boundary above turns both into one 404.
 */
export const readSavedPromoMailEffect = (args: {
  id: string;
}): Effect.Effect<SavedPromoMail | null, never, PromoStore> =>
  Effect.gen(function* () {
    const row = yield* PromoStore.byId(args.id);
    if (!row || row.savedAt === null) return null;

    return {
      id: row.id,
      subject: row.subject,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      internalDate: row.internalDate ? row.internalDate.toISOString() : null,
      bodyHtml: row.bodyHtml,
      bodyText: row.bodyText,
    };
  });

// Promise facade for the API/CLI boundary.
export async function readSavedPromoMail(args: { id: string }): Promise<SavedPromoMail | null> {
  return runWithStores(readSavedPromoMailEffect(args));
}

/* ------------------------------------------------------------------------- *
 * Saving a promo, and trashing the mail it came from (#161)
 * ------------------------------------------------------------------------- */

export interface SavePromoArgs {
  id: string;
  /** Injected by the suites; production builds one from the account's tokens. */
  gmail?: GmailDataAdapter;
  /** The instant the save is recorded at — a parameter, so it is assertable. */
  now?: Date;
}

export interface SavePromoResult {
  ok: true;
  id: string;
  /**
   * The thread Gmail trashed, or null when Gmail refused it. The promo is
   * saved either way — that is the point of the ordering — so a caller reads
   * this to say what is left to do by hand, never to decide whether the save
   * happened.
   */
  trashedThreadId: string | null;
}

/**
 * One button, two writes, and the order between them is the reason this is a
 * service rather than a click handler.
 *
 * 1. **Save first** — the saved state with its denormalised copy of the mail.
 * 2. **Then trash** — through the same `trashMessageEffect` every other caller
 *    uses, which trashes the whole thread the way Gmail does.
 *
 * A trash Gmail refuses leaves the promo saved: recoverable, mildly confusing,
 * a mail the user deletes by hand. The reverse order allows
 * trash-succeeds-then-save-fails, which deletes the mail and loses the code —
 * not recoverable from anywhere. So this deliberately departs from the apply
 * service's usual guarantee, where Gmail is told before anything is written
 * locally so the mailbox and the database cannot disagree; two writes with no
 * such guarantee is the accepted cost of the single-button design.
 *
 * Trash, not permanent delete: deleting for good needs the full-mailbox scope,
 * re-consented by every connected account, to make one button thirty days more
 * final — and the local copy is permanent anyway.
 *
 * The copy is taken from the message row rather than from Gmail, because the
 * mail is on its way out and this is the only version anyone will see again;
 * saving is what makes a promo outlive the message it hangs off.
 */
export const savePromoEffect = (
  args: SavePromoArgs,
): Effect.Effect<SavePromoResult, Error, PromoStore | MessageStore> =>
  Effect.gen(function* () {
    const row = yield* PromoStore.byId(args.id);
    if (!row) return yield* Effect.fail(new Error(`Promo not found: ${args.id}`));

    const ref = { accountId: row.accountId, gmailMessageId: row.gmailMessageId };
    const message = yield* MessageStore.detail(ref);
    if (!message) {
      return yield* Effect.fail(new Error(`Message not found: ${row.gmailMessageId}`));
    }

    // Saved already means the record has been taken; a second press is the mail
    // still being in the inbox, so it is the trash below that is retried.
    if (row.savedAt === null) {
      yield* PromoStore.markSaved({
        id: row.id,
        savedAt: args.now ?? new Date(),
        message: {
          subject: message.subject,
          fromName: message.fromName,
          fromEmail: message.fromEmail,
          internalDate: message.internalDate,
          bodyHtml: message.bodyHtml,
          bodyText: message.bodyText,
        },
      });
    }

    const trashed = yield* trashMessageEffect({ ...ref, gmail: args.gmail }).pipe(
      Effect.catchAll((err: Error) => {
        debug.warn("promo saved but the mail was not trashed", {
          id: row.id,
          gmailMessageId: row.gmailMessageId,
          error: err.message,
        });
        return Effect.succeed(null);
      }),
    );

    debug.info("promo saved", { id: row.id, trashed: trashed !== null });
    return { ok: true, id: row.id, trashedThreadId: trashed?.threadId ?? null };
  });

// Promise facade for the API boundary.
export async function savePromo(args: SavePromoArgs): Promise<SavePromoResult> {
  return runWithStores(savePromoEffect(args));
}

/* ------------------------------------------------------------------------- *
 * Correcting a saved promo, and removing one (#164)
 * ------------------------------------------------------------------------- */

/**
 * The five extracted fields, as an edit names them.
 *
 * A **patch**, not a replacement: a field the patch does not name is the field
 * nobody touched, and `null` is how a nullable one is cleared — which is what
 * an emptied box in the editor means. The alternative would make correcting the
 * merchant require re-sending the terms, so a save from a row loaded five
 * minutes ago would overwrite whatever had been fixed since.
 *
 * All five are here, and that is the point rather than a convenience: they are
 * the model's guesses on deliberately slippery marketing prose, so locking any
 * subset guarantees the locked one is the field it got wrong. `discount` is the
 * only one that cannot be cleared — it is the headline that makes the row a
 * promo at all — which is the wire schema's rule, stated there.
 *
 * `expiresAt` crosses as a calendar day (`YYYY-MM-DD`), never an instant. A
 * promo expires on a date; {@link promoExpiryInstant} is what turns the day
 * into the stored value, and it is the same function the extraction writes
 * through.
 */
export interface PromoFieldsPatch {
  code?: string | null;
  discount?: string;
  terms?: string | null;
  expiresAt?: string | null;
  merchant?: string | null;
}

/** A promo's guesses as they now stand — what an edit answers with. */
export interface EditedPromo {
  id: string;
  code: string | null;
  discount: string;
  terms: string | null;
  expiresAt: string | null;
  merchant: string | null;
}

const editedPromo = (row: StoredPromoCode): EditedPromo => ({
  id: row.id,
  code: row.code,
  discount: row.discount,
  terms: row.terms,
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  merchant: row.merchant,
});

/** The patch as the store takes one: days become instants, the rest passes. */
const storedFields = (patch: PromoFieldsPatch): Partial<PromoFields> => {
  const fields: Partial<PromoFields> = {};
  if (patch.code !== undefined) fields.code = patch.code;
  if (patch.discount !== undefined) fields.discount = patch.discount;
  if (patch.terms !== undefined) fields.terms = patch.terms;
  if (patch.merchant !== undefined) fields.merchant = patch.merchant;
  if (patch.expiresAt !== undefined) {
    fields.expiresAt = patch.expiresAt === null ? null : promoExpiryInstant(patch.expiresAt);
  }
  return fields;
};

/**
 * Correct what the extraction guessed.
 *
 * The rule that decides who may be edited is the same one the copy of the mail
 * is read under: this is a **saved** promo's, and a detection nobody acted on
 * answers null. That is not caution about writes — it is what the two states
 * mean. A suggestion has no editor anywhere on screen, and a row in the middle
 * of being corrected is a row the user has decided to keep.
 *
 * What is deliberately out of reach here is everything beside those five
 * fields. The copy of the mail is a record of what a shop actually said, so no
 * field of it is in {@link PromoFieldsPatch} and the wire schema refuses a
 * patch that names one rather than dropping it quietly.
 *
 * The row is read back rather than assembled from the patch, so what a caller
 * is answered with is what storage holds — including the expiry, which went in
 * as a day and comes back as the instant that day is stored as.
 */
export const updateSavedPromoEffect = (args: {
  id: string;
  fields: PromoFieldsPatch;
}): Effect.Effect<EditedPromo | null, never, PromoStore> =>
  Effect.gen(function* () {
    const row = yield* PromoStore.byId(args.id);
    if (!row || row.savedAt === null) return null;

    yield* PromoStore.patch({ id: row.id, fields: storedFields(args.fields) });

    const updated = yield* PromoStore.byId(row.id);
    return updated ? editedPromo(updated) : null;
  });

// Promise facade for the API boundary.
export async function updateSavedPromo(args: {
  id: string;
  fields: PromoFieldsPatch;
}): Promise<EditedPromo | null> {
  return runWithStores(updateSavedPromoEffect(args));
}

/**
 * Take a saved promo off the page.
 *
 * Deletion is always the user's own act: nothing here expires anything away,
 * and an expired promo in particular is kept — the record of what a shop
 * offered is worth having, and a page that tidied itself would be deciding on
 * the user's behalf. So this is the one thing that removes a row, and it is
 * reached only by asking for it.
 *
 * Saved rows only, for the reason the edit is: removing an unsaved detection
 * would be a *dismissal*, a different act with a different meaning — one this
 * feature does not have, and one that would need its own answer to what
 * happens on the next sync (nothing: extraction never asks twice).
 *
 * `false` is "there was nothing here to take", which the boundary above turns
 * into the same 404 an unknown id gets.
 */
export const deleteSavedPromoEffect = (args: {
  id: string;
}): Effect.Effect<boolean, never, PromoStore> =>
  Effect.gen(function* () {
    const row = yield* PromoStore.byId(args.id);
    if (!row || row.savedAt === null) return false;

    const removed = yield* PromoStore.remove(row.id);
    debug.info("saved promo deleted", { id: row.id });
    return removed > 0;
  });

// Promise facade for the API boundary.
export async function deleteSavedPromo(args: { id: string }): Promise<boolean> {
  return runWithStores(deleteSavedPromoEffect(args));
}

/* ------------------------------------------------------------------------- *
 * Asking for one message, by hand (#165)
 * ------------------------------------------------------------------------- */

/**
 * What a manual run answers with: the detections that now stand for the
 * message, as the suggestions section reads them.
 *
 * `found` is deliberately not inferred from the array's length by the caller —
 * a run that answered nothing is a real answer and the one the button most
 * needs to report, since "the model found no codes here" and "nothing
 * happened" look identical on screen otherwise.
 */
export interface ExtractPromosForMessageResult {
  /** The rows written by this run, replacing whatever the last one left. */
  promos: PromoSuggestion[];
  /** Whether the model answered with any promo at all. */
  found: boolean;
}

export interface ExtractPromosForMessageArgs {
  accountId: string;
  gmailMessageId: string;
}

/**
 * Extract promo codes from **one** message, because someone asked.
 *
 * The sync's own extraction (above) is a fill-forward over what a fetch just
 * brought in, gated by {@link shouldExtractPromos} and never repeated. This is
 * the other door, and it differs from that one in three ways that are each the
 * point rather than an inconsistency:
 *
 * - **No prefilter.** The prefilter exists to bound what a whole sync spends,
 *   guessing from content alone which mails are worth a call. A user pressing
 *   the button *is* the decision to spend one, and on a mail the prefilter
 *   skipped is exactly when they would press it — so consulting it here would
 *   make the button silently do nothing in the one case it exists for.
 *
 * - **Asking again is allowed, and replaces.** Nothing in the sync path ever
 *   asks twice, which is what lets it write without looking. A button can be
 *   pressed twice, so the previous answer for this mail is cleared first;
 *   otherwise a second press leaves the same offer on screen twice. Only
 *   *unsaved* rows go — that rule is stated at
 *   {@link PromoStoreImpl.removeUnsavedForMessage}, and it is the difference
 *   between a guess and a decision the user has already made.
 *
 * - **Failure is the caller's news, not a log line.** A sync swallows one bad
 *   answer so the rest of the run survives; here the run *is* the one message,
 *   so there is nothing to protect and a caller who pressed a button is owed
 *   the refusal. Both classes therefore propagate: a provider that cannot run
 *   surfaces as the same `ProviderUnavailableError` every other call site
 *   raises, and the boundary maps it to the 503 a missing credential already
 *   answers with.
 *
 * The mail is read as the same visible text the sync extraction uses — the
 * stripped HTML part when there is one — so the two doors cannot come to
 * different answers about the same mail for reasons no one can see.
 */
export const extractPromosForMessageEffect = (
  args: ExtractPromosForMessageArgs,
): Effect.Effect<
  ExtractPromosForMessageResult,
  Error | ProviderUnavailableError,
  Claude | PromoStore | MessageStore
> =>
  Effect.gen(function* () {
    const message = yield* MessageStore.detail(args);
    if (!message) {
      return yield* Effect.fail(new Error(`Message not found: ${args.gmailMessageId}`));
    }

    const candidate: PromoCandidateMessage = {
      gmailMessageId: message.gmailMessageId,
      fromEmail: message.fromEmail,
      fromName: message.fromName,
      subject: message.subject,
      bodyText: message.bodyText ?? "",
      bodyHtml: message.bodyHtml ?? "",
      internalDate: message.internalDate,
    };

    const claude = yield* Claude;
    const { output } = yield* claude.run("promo-extract", {
      from: senderLine(candidate),
      subject: candidate.subject,
      receivedAt: candidate.internalDate.toISOString(),
      body: visibleText(candidate),
    });

    // Clear then write, in that order: the replacement is what makes a second
    // press a re-ask rather than a duplicate. A run that found nothing still
    // clears, because "the model now says there is nothing here" is an answer
    // and leaving the old guess up would contradict what the button just said.
    yield* PromoStore.removeUnsavedForMessage(args);
    const rows = output.promos.map((p) => toRow(args.accountId, candidate, p));
    const stored = yield* PromoStore.insert(rows);

    debug.info("promos extracted on request", {
      gmailMessageId: args.gmailMessageId,
      extracted: stored.length,
    });

    return { promos: stored.map(suggestion), found: stored.length > 0 };
  });

// Promise facade for the API boundary. `ClaudeLive` is provided here rather
// than by the caller, like every other AI call site's facade: the stores its
// implementation reads are captured when the layer is built, so the boundary
// cannot construct one without them.
export async function extractPromosForMessage(
  args: ExtractPromosForMessageArgs,
): Promise<ExtractPromosForMessageResult> {
  return runWithStores(Effect.provide(extractPromosForMessageEffect(args), ClaudeLive));
}
