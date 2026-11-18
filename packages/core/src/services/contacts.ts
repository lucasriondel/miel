/**
 * The compose window's address suggestions: "people you've emailed".
 *
 * Filled from the two places that know who an account writes to — every send
 * through miel records its recipients (`recordRecipientsEffect`), and each sync
 * harvests the To/Cc/Bcc headers of the account's sent mail in the window it
 * synced ({@link harvestSentContactsEffect}). The harvest reads headers only,
 * never a body, and writes nothing to `messages`: sent mail stays out of the
 * inbox list, which is why the sync's own search keeps its `-in:sent`.
 */
import { Effect } from "effect";
import type { GmailDataAdapter } from "../google/gmailAdapter";
import { ContactStore } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { parseNamedAddressList } from "../util/gmailPayload";
import { tryAsync } from "../util/effect";

const debug = createDebug("service:contacts");

export interface ContactSuggestion {
  email: string;
  name: string | null;
  timesContacted: number;
  lastContactedAt: string;
}

/** The most suggestions a request may ask for. */
export const MAX_CONTACT_SUGGESTIONS = 20;

export const suggestContactsEffect = (args: {
  accountId: string;
  query: string;
  limit?: number;
}): Effect.Effect<ContactSuggestion[], never, ContactStore> =>
  Effect.map(
    ContactStore.use((svc) =>
      svc.search({
        accountId: args.accountId,
        query: args.query,
        limit: Math.min(Math.max(args.limit ?? 8, 1), MAX_CONTACT_SUGGESTIONS),
      }),
    ),
    (rows) =>
      rows.map((r) => ({
        email: r.email,
        name: r.name,
        timesContacted: r.timesContacted,
        lastContactedAt: r.lastContactedAt.toISOString(),
      })),
  );

/** The headers a harvest reads — the recipients of a sent mail, and nothing else. */
const RECIPIENT_HEADERS = ["To", "Cc", "Bcc"] as const;

/**
 * Record who the account wrote to in its sent mail matching `query` (the sync's
 * own window, with `in:sent` for `-in:sent`). Answers how many sent messages
 * were read. A message whose headers cannot be read is skipped: suggestions are
 * a convenience, and a sync is not failed for one.
 */
export const harvestSentContactsEffect = (args: {
  accountId: string;
  accountEmail: string;
  query: string;
  max: number;
  gmail: GmailDataAdapter;
}): Effect.Effect<number, Error, ContactStore> =>
  Effect.gen(function* () {
    const hits = yield* tryAsync(() =>
      args.gmail.searchMessages({ account: args.accountEmail, query: args.query, max: args.max }),
    );
    if (hits.length === 0) return 0;
    const metas = yield* Effect.forEach(
      hits,
      (hit) =>
        tryAsync(() =>
          args.gmail.getMessageHeaders({
            account: args.accountEmail,
            messageId: hit.messageId,
            headers: RECIPIENT_HEADERS,
          }),
        ).pipe(Effect.catch(() => Effect.succeed(null))),
      { concurrency: 5 },
    );
    const own = args.accountEmail.toLowerCase();
    // Oldest first, so a person written to twice in the window counts twice.
    const sorted = metas
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .toSorted((a, b) => a.internalDate.getTime() - b.internalDate.getTime());
    const store = yield* ContactStore;
    for (const meta of sorted) {
      const people = RECIPIENT_HEADERS.flatMap((h) =>
        parseNamedAddressList(meta.headers[h.toLowerCase()]),
      ).filter((p) => p.email.toLowerCase() !== own);
      if (people.length === 0) continue;
      yield* store.record(
        people.map((p) => ({
          accountId: args.accountId,
          email: p.email,
          name: p.name,
          contactedAt: meta.internalDate,
        })),
      );
    }
    debug("harvested", { account: args.accountEmail, sent: sorted.length });
    return sorted.length;
  });

export async function suggestContacts(args: {
  accountId: string;
  query: string;
  limit?: number;
}): Promise<ContactSuggestion[]> {
  return runWithStores(suggestContactsEffect(args));
}
