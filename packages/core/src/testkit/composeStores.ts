/**
 * In-memory adapters for the outbox (staged uploads and scheduled sends) and
 * the contacts the address suggestions are drawn from — the second
 * implementation of `OutboxStore` and `ContactStore`, held to the same contract
 * (`./storeContract`) as the Postgres one.
 *
 * The rows stay readable and mutable, so "what is stored now" is asserted by
 * looking at them; `offline` fails every operation the way an unreachable
 * database does.
 */
import { Effect } from "effect";
import type {
  ContactStoreImpl,
  OutboxStoreImpl,
  StoredContact,
  StoredScheduledSend,
  UploadWithData,
} from "../stores/contracts";

/** How an unreachable Postgres presents itself to a caller. */
const OUTAGE = () => new Error("ECONNREFUSED 127.0.0.1:5432");

export interface FakeOutbox extends OutboxStoreImpl {
  readonly uploads: UploadWithData[];
  readonly scheduled: StoredScheduledSend[];
  offline: boolean;
}

export interface FakeContacts extends ContactStoreImpl {
  readonly rows: StoredContact[];
  offline: boolean;
}

const withoutData = ({ data: _data, ...meta }: UploadWithData) => meta;

/** A copy, so a result taken before a write does not change under the test. */
const copyOf = (row: StoredScheduledSend): StoredScheduledSend => ({
  ...row,
  payload: { ...row.payload },
});

export function makeFakeOutbox(seed?: {
  uploads?: UploadWithData[];
  scheduled?: StoredScheduledSend[];
}): FakeOutbox {
  const store: FakeOutbox = {
    uploads: [...(seed?.uploads ?? [])],
    scheduled: [...(seed?.scheduled ?? [])],
    offline: false,
    putUpload: undefined as never,
    uploadsByIds: undefined as never,
    removeUpload: undefined as never,
    sweepUploads: undefined as never,
    schedule: undefined as never,
    scheduledById: undefined as never,
    scheduledList: undefined as never,
    cancelScheduled: undefined as never,
    reschedule: undefined as never,
    claimDue: undefined as never,
    finishScheduled: undefined as never,
  };
  const answer = <A>(f: () => A): Effect.Effect<A> =>
    Effect.suspend(() => (store.offline ? Effect.die(OUTAGE()) : Effect.sync(f)));
  const byId = (id: string) => store.scheduled.find((s) => s.id === id);

  const impl: OutboxStoreImpl = {
    putUpload: (row) =>
      answer(() => {
        const stored: UploadWithData = {
          id: crypto.randomUUID(),
          accountId: row.accountId,
          filename: row.filename,
          mimeType: row.mimeType,
          size: row.data.byteLength,
          data: row.data,
          createdAt: new Date(),
        };
        store.uploads.push(stored);
        return withoutData(stored);
      }),

    uploadsByIds: ({ accountId, ids }) =>
      answer(() => store.uploads.filter((u) => u.accountId === accountId && ids.includes(u.id))),

    removeUpload: ({ accountId, id }) =>
      answer(() => {
        const index = store.uploads.findIndex((u) => u.accountId === accountId && u.id === id);
        if (index < 0) return 0;
        store.uploads.splice(index, 1);
        return 1;
      }),

    sweepUploads: (createdBefore) =>
      answer(() => {
        const pinned = new Set(
          store.scheduled
            .filter((s) => s.status === "pending" || s.status === "sending")
            .flatMap((s) => s.payload.uploadIds ?? []),
        );
        const doomed = store.uploads.filter(
          (u) => u.createdAt < createdBefore && !pinned.has(u.id),
        );
        for (const u of doomed) store.uploads.splice(store.uploads.indexOf(u), 1);
        return doomed.length;
      }),

    schedule: (row) =>
      answer(() => {
        const stored: StoredScheduledSend = {
          ...row,
          payload: { ...row.payload },
          id: crypto.randomUUID(),
          status: "pending",
          attempts: 0,
          claimedAt: null,
          sentAt: null,
          sentMessageId: null,
          threadId: null,
          error: null,
          createdAt: new Date(),
        };
        store.scheduled.push(stored);
        return copyOf(stored);
      }),

    scheduledById: (id) =>
      answer(() => {
        const row = byId(id);
        return row ? copyOf(row) : null;
      }),

    scheduledList: ({ accountId, statuses }) =>
      answer(() =>
        store.scheduled
          .filter((s) => statuses.includes(s.status) && (!accountId || s.accountId === accountId))
          .toSorted(
            (a, b) =>
              a.sendAt.getTime() - b.sendAt.getTime() ||
              a.createdAt.getTime() - b.createdAt.getTime(),
          )
          .map(copyOf),
      ),

    cancelScheduled: (id) =>
      answer(() => {
        const row = byId(id);
        if (!row || row.status !== "pending") return 0;
        row.status = "cancelled";
        return 1;
      }),

    reschedule: ({ id, sendAt }) =>
      answer(() => {
        const row = byId(id);
        if (!row || (row.status !== "pending" && row.status !== "failed")) return 0;
        Object.assign(row, {
          status: "pending",
          sendAt,
          error: null,
          attempts: 0,
          claimedAt: null,
        });
        return 1;
      }),

    claimDue: ({ now, staleBefore, limit }) =>
      answer(() =>
        store.scheduled
          .filter(
            (s) =>
              (s.status === "pending" && s.sendAt <= now) ||
              (s.status === "sending" && s.claimedAt !== null && s.claimedAt < staleBefore),
          )
          .toSorted((a, b) => a.sendAt.getTime() - b.sendAt.getTime())
          .slice(0, limit)
          .map((row) => {
            Object.assign(row, { status: "sending", claimedAt: now, attempts: row.attempts + 1 });
            return copyOf(row);
          }),
      ),

    finishScheduled: ({ id, outcome }) =>
      answer(() => {
        const row = byId(id);
        if (!row || row.status !== "sending") return;
        if (outcome.kind === "sent") {
          Object.assign(row, {
            status: "sent",
            sentAt: outcome.sentAt,
            sentMessageId: outcome.sentMessageId,
            threadId: outcome.threadId,
            error: null,
          });
        } else if (outcome.kind === "failed") {
          Object.assign(row, { status: "failed", error: outcome.error });
        } else {
          Object.assign(row, { status: "pending", sendAt: outcome.sendAt, error: outcome.error });
        }
      }),
  };
  return Object.assign(store, impl);
}

export function makeFakeContacts(seed?: StoredContact[]): FakeContacts {
  const store: FakeContacts = {
    rows: [...(seed ?? [])],
    offline: false,
    record: undefined as never,
    search: undefined as never,
  };
  const answer = <A>(f: () => A): Effect.Effect<A> =>
    Effect.suspend(() => (store.offline ? Effect.die(OUTAGE()) : Effect.sync(f)));

  const impl: ContactStoreImpl = {
    record: (sightings) =>
      answer(() => {
        for (const s of sightings) {
          const email = s.email.toLowerCase();
          const row = store.rows.find((r) => r.accountId === s.accountId && r.email === email);
          if (!row) {
            store.rows.push({
              accountId: s.accountId,
              email,
              name: s.name,
              timesContacted: 1,
              lastContactedAt: s.contactedAt,
            });
            continue;
          }
          if (s.contactedAt > row.lastContactedAt) {
            row.timesContacted += 1;
            row.lastContactedAt = s.contactedAt;
          }
          row.name ??= s.name;
        }
      }),

    search: ({ accountId, query, limit }) =>
      answer(() => {
        const q = query.trim().toLowerCase();
        return store.rows
          .filter(
            (r) =>
              r.accountId === accountId &&
              (q.length === 0 ||
                r.email.includes(q) ||
                (r.name !== null && r.name.toLowerCase().includes(q))),
          )
          .toSorted(
            (a, b) =>
              b.timesContacted - a.timesContacted ||
              b.lastContactedAt.getTime() - a.lastContactedAt.getTime() ||
              (a.email < b.email ? -1 : a.email > b.email ? 1 : 0),
          )
          .slice(0, limit)
          .map((r) => ({ ...r }));
      }),
  };
  return Object.assign(store, impl);
}
