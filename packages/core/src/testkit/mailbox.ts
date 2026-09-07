/**
 * The in-memory mailbox (#136, #157) — the second implementation of
 * `MessageStore`, `TriageStore`, `LabelStore` and `PromoStore`.
 *
 * One dataset behind four fakes, because that is what the tables are: a listed
 * message carries its account's email and its newest triage's priority, an
 * extracted promo is suggested only while its mail is still in the inbox, and a
 * fake that could not join those would answer differently from Postgres, which
 * is worse than no fake at all.
 *
 * Rows are seeded with the columns a test cares about; everything else takes a
 * default, so a suite about pagination writes `internalDate` and nothing else.
 * The arrays stay readable and mutable after seeding, so "what is stored now"
 * is asserted by looking at them rather than by re-reading through the service.
 */
import { Effect } from "effect";
import type { PriorityT } from "../schemas/triage";
import {
  type LabelStoreImpl,
  type MessageFlags,
  type MessageRef,
  type MessageStoreImpl,
  type PromoFields,
  type PromoStoreImpl,
  type StoredAccount,
  type StoredAttachment,
  type StoredLabel,
  type StoredPromoCode,
  type StoredTriage,
  type SuggestionStatus,
  type TriageStoreImpl,
} from "../stores/contracts";

/** How an unreachable Postgres presents itself to a caller. */
const OUTAGE = () => new Error("ECONNREFUSED 127.0.0.1:5432");

export interface MailboxMessageRow {
  accountId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  internalDate: Date;
  rawHeaders: Record<string, string> | null;
  isArchived: boolean;
  isTrashed: boolean;
  removedAt: Date | null;
}

export interface MailboxMessageLabelRow extends MessageRef {
  labelId: string;
}

export interface MailboxExistingSuggestionRow {
  triageId: string;
  labelId: string;
  status: SuggestionStatus;
}

export interface MailboxNewSuggestionRow {
  suggestionId: string;
  triageId: string;
  name: string;
  reasoning: string | null;
  status: SuggestionStatus;
  createdLabelId: string | null;
}

/** Everything a mailbox holds, as the four stores see it. */
export interface MailboxData {
  accounts: StoredAccount[];
  messages: MailboxMessageRow[];
  labels: StoredLabel[];
  messageLabels: MailboxMessageLabelRow[];
  attachments: StoredAttachment[];
  triages: StoredTriage[];
  existingSuggestions: MailboxExistingSuggestionRow[];
  newSuggestions: MailboxNewSuggestionRow[];
  /**
   * The promos extracted from those messages (#157). They live here rather than
   * in a fake of their own because the suggestions read joins the mail: it is
   * scoped to the message's date, and an unsaved detection follows its message
   * out of the inbox.
   */
  promos: StoredPromoCode[];
}

/**
 * Adding a row after seeding, with the same defaults the seed gets — a suite
 * that wants a second triage should not have to spell out seven columns to
 * describe one that is newer.
 */
export interface MailboxWriter {
  account: (seed: AccountSeed) => StoredAccount;
  message: (seed: MessageSeed) => MailboxMessageRow;
  label: (seed: LabelSeed) => StoredLabel;
  attachment: (seed: AttachmentSeed) => StoredAttachment;
  triage: (seed: TriageSeed) => StoredTriage;
  existingSuggestion: (seed: ExistingSuggestionSeed) => MailboxExistingSuggestionRow;
  newSuggestion: (seed: NewSuggestionSeed) => MailboxNewSuggestionRow;
  messageLabel: (row: MailboxMessageLabelRow) => MailboxMessageLabelRow;
  promo: (seed: PromoSeed) => StoredPromoCode;
}

export interface FakeMailbox extends MailboxData {
  /** When true, every operation fails the way an unreachable database does. */
  offline: boolean;
  readonly add: MailboxWriter;
  readonly messageStore: MessageStoreImpl;
  readonly triageStore: TriageStoreImpl;
  readonly labelStore: LabelStoreImpl;
  readonly promoStore: PromoStoreImpl;
}

type Seed<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required | "internalDate" | "createdAt">> & {
    internalDate?: Date | string;
    createdAt?: Date | string;
  };

export type AccountSeed = Seed<StoredAccount, "id" | "email">;
export type MessageSeed = Seed<MailboxMessageRow, "accountId" | "gmailMessageId">;
export type LabelSeed = Seed<StoredLabel, "id" | "accountId" | "name">;
export type AttachmentSeed = Seed<
  StoredAttachment,
  "accountId" | "gmailMessageId" | "attachmentId"
>;
export type TriageSeed = Seed<StoredTriage, "id" | "accountId" | "gmailMessageId">;
export type ExistingSuggestionSeed = Seed<MailboxExistingSuggestionRow, "triageId" | "labelId">;
export type NewSuggestionSeed = Seed<MailboxNewSuggestionRow, "suggestionId" | "triageId" | "name">;
export type PromoSeed = Seed<StoredPromoCode, "id" | "accountId" | "gmailMessageId" | "discount">;

export interface MailboxSeed {
  accounts?: AccountSeed[];
  messages?: MessageSeed[];
  labels?: LabelSeed[];
  messageLabels?: MailboxMessageLabelRow[];
  attachments?: AttachmentSeed[];
  triages?: TriageSeed[];
  existingSuggestions?: ExistingSuggestionSeed[];
  newSuggestions?: NewSuggestionSeed[];
  promos?: PromoSeed[];
}

const at = (value: Date | string | undefined, fallback: Date): Date =>
  value === undefined ? fallback : value instanceof Date ? value : new Date(value);

const EPOCH = new Date("2026-01-01T00:00:00.000Z");

const account = (seed: AccountSeed): StoredAccount => ({
  displayName: null,
  avatarUrl: null,
  lastSyncedAt: null,
  ...seed,
  createdAt: at(seed.createdAt, EPOCH),
});

const message = (seed: MessageSeed): MailboxMessageRow => ({
  gmailThreadId: `thread-${seed.gmailMessageId}`,
  fromEmail: "sender@example.com",
  fromName: null,
  toEmails: [],
  subject: null,
  snippet: null,
  bodyText: null,
  bodyHtml: null,
  rawHeaders: null,
  isArchived: false,
  isTrashed: false,
  removedAt: null,
  ...seed,
  internalDate: at(seed.internalDate, EPOCH),
});

const label = (seed: LabelSeed): StoredLabel => ({
  gmailLabelId: `Label_${seed.id}`,
  type: "user",
  colorBg: null,
  colorFg: null,
  ...seed,
});

const attachment = (seed: AttachmentSeed): StoredAttachment => ({
  filename: "attachment.pdf",
  mimeType: "application/pdf",
  size: 1024,
  ...seed,
});

const triage = (seed: TriageSeed): StoredTriage => ({
  priority: "medium" as PriorityT,
  reasoning: "because",
  model: null,
  ...seed,
  createdAt: at(seed.createdAt, EPOCH),
});

const existingSuggestion = (seed: ExistingSuggestionSeed): MailboxExistingSuggestionRow => ({
  status: "pending",
  ...seed,
});

const newSuggestion = (seed: NewSuggestionSeed): MailboxNewSuggestionRow => ({
  reasoning: null,
  status: "pending",
  createdLabelId: null,
  ...seed,
});

/**
 * A promo defaults to the suggested state with no copy of the mail: every column
 * the save writes is null until a save writes it.
 */
const promo = (seed: PromoSeed): StoredPromoCode => ({
  code: null,
  terms: null,
  expiresAt: null,
  merchant: null,
  savedAt: null,
  subject: null,
  fromName: null,
  fromEmail: null,
  bodyHtml: null,
  bodyText: null,
  ...seed,
  internalDate: seed.internalDate === undefined ? null : at(seed.internalDate, EPOCH),
  createdAt: at(seed.createdAt, EPOCH),
});

const sameRef = (a: MessageRef, b: MessageRef) =>
  a.accountId === b.accountId && a.gmailMessageId === b.gmailMessageId;

const inRefs = (refs: readonly MessageRef[], row: MessageRef) =>
  refs.some((ref) => sameRef(ref, row));

/**
 * Normalize a seed, store it, and hand it back for the test to name.
 *
 * The rows are reached through a getter rather than captured, so a suite that
 * replaces one of the arrays outright ("this install has never synced its
 * labels") still adds to the array that is live.
 */
const pushing =
  <SeedIn, RowOut>(rows: () => RowOut[], normalize: (seed: SeedIn) => RowOut) =>
  (seed: SeedIn): RowOut => {
    const row = normalize(seed);
    rows().push(row);
    return row;
  };

/**
 * A promo as a query hands one back: a copy. The suites that matter here write
 * through the store and read again, and a live row would make "the save wrote
 * it" true of a result taken before the save ran.
 */
const copyOf = (row: StoredPromoCode): StoredPromoCode => ({ ...row });

/** Newest first, ties broken by id descending — the list's own ordering. */
const newestFirst = (a: { internalDate: Date; gmailMessageId: string }, b: typeof a) =>
  b.internalDate.getTime() - a.internalDate.getTime() ||
  (a.gmailMessageId < b.gmailMessageId ? 1 : a.gmailMessageId > b.gmailMessageId ? -1 : 0);

export function makeFakeMailbox(seed?: MailboxSeed): FakeMailbox {
  let nextLabelId = 1;

  const data: FakeMailbox = {
    accounts: (seed?.accounts ?? []).map(account),
    messages: (seed?.messages ?? []).map(message),
    labels: (seed?.labels ?? []).map(label),
    messageLabels: [...(seed?.messageLabels ?? [])],
    attachments: (seed?.attachments ?? []).map(attachment),
    triages: (seed?.triages ?? []).map(triage),
    existingSuggestions: (seed?.existingSuggestions ?? []).map(existingSuggestion),
    newSuggestions: (seed?.newSuggestions ?? []).map(newSuggestion),
    promos: (seed?.promos ?? []).map(promo),
    offline: false,
    // Filled in below; the writer and the impls close over `data` so a test can
    // keep adding rows after the stores are built.
    add: undefined as unknown as MailboxWriter,
    messageStore: undefined as unknown as MessageStoreImpl,
    triageStore: undefined as unknown as TriageStoreImpl,
    labelStore: undefined as unknown as LabelStoreImpl,
    promoStore: undefined as unknown as PromoStoreImpl,
  };

  const add: MailboxWriter = {
    account: pushing(() => data.accounts, account),
    message: pushing(() => data.messages, message),
    label: pushing(() => data.labels, label),
    attachment: pushing(() => data.attachments, attachment),
    triage: pushing(() => data.triages, triage),
    existingSuggestion: pushing(() => data.existingSuggestions, existingSuggestion),
    newSuggestion: pushing(() => data.newSuggestions, newSuggestion),
    messageLabel: pushing(
      () => data.messageLabels,
      (row: MailboxMessageLabelRow) => row,
    ),
    promo: pushing(() => data.promos, promo),
  };

  /**
   * The id Postgres would have generated. Seeded rows are free to have named
   * themselves `label-1`, so a generated id steps over what is already there
   * rather than colliding with it.
   */
  const freshLabelId = () => {
    let id = `label-${nextLabelId++}`;
    while (data.labels.some((l) => l.id === id)) id = `label-${nextLabelId++}`;
    return id;
  };

  const answer = <A>(f: () => A): Effect.Effect<A> =>
    Effect.suspend(() => (data.offline ? Effect.die(OUTAGE()) : Effect.sync(f)));

  const emailOf = (accountId: string) => data.accounts.find((a) => a.id === accountId)?.email;

  const latestTriageOf = (ref: MessageRef): StoredTriage | undefined =>
    data.triages
      .filter((t) => sameRef(t, ref))
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  const messageStore: MessageStoreImpl = {
    list: (filter) =>
      answer(() =>
        data.messages
          .filter((m) => {
            if (filter.accountId && m.accountId !== filter.accountId) return false;
            if (!filter.includeArchived && m.isArchived) return false;
            if (!filter.includeTrashed && m.isTrashed) return false;
            if (!filter.includeRemoved && m.removedAt !== null) return false;
            if (filter.internalDateFrom && m.internalDate < filter.internalDateFrom) return false;
            if (filter.internalDateTo && m.internalDate >= filter.internalDateTo) return false;
            if (
              filter.labelId &&
              !data.messageLabels.some((ml) => sameRef(ml, m) && ml.labelId === filter.labelId)
            ) {
              return false;
            }
            if (filter.priority && latestTriageOf(m)?.priority !== filter.priority) return false;
            if (filter.olderThan) {
              const { internalDate, gmailMessageId } = filter.olderThan;
              const older =
                m.internalDate < internalDate ||
                (m.internalDate.getTime() === internalDate.getTime() &&
                  m.gmailMessageId < gmailMessageId);
              if (!older) return false;
            }
            // The account join is an inner one: a message whose account row is
            // gone is not listable.
            return emailOf(m.accountId) !== undefined;
          })
          .toSorted(newestFirst)
          .slice(0, filter.limit)
          .map((m) => {
            const latest = latestTriageOf(m);
            return {
              accountId: m.accountId,
              accountEmail: emailOf(m.accountId)!,
              gmailMessageId: m.gmailMessageId,
              gmailThreadId: m.gmailThreadId,
              fromEmail: m.fromEmail,
              fromName: m.fromName,
              toEmails: m.toEmails,
              subject: m.subject,
              snippet: m.snippet,
              internalDate: m.internalDate,
              isArchived: m.isArchived,
              isTrashed: m.isTrashed,
              priority: latest?.priority ?? null,
              triageId: latest?.id ?? null,
            };
          }),
      ),

    detail: (ref) =>
      answer(() => {
        const m = data.messages.find((row) => sameRef(row, ref));
        const email = m && emailOf(m.accountId);
        if (!m || email === undefined) return null;
        return {
          accountId: m.accountId,
          accountEmail: email,
          gmailMessageId: m.gmailMessageId,
          gmailThreadId: m.gmailThreadId,
          fromEmail: m.fromEmail,
          fromName: m.fromName,
          toEmails: m.toEmails,
          subject: m.subject,
          snippet: m.snippet,
          bodyText: m.bodyText,
          bodyHtml: m.bodyHtml,
          internalDate: m.internalDate,
          isArchived: m.isArchived,
          isTrashed: m.isTrashed,
          rawHeaders: m.rawHeaders,
        };
      }),

    threadIdOf: (ref) =>
      answer(() => data.messages.find((m) => sameRef(m, ref))?.gmailThreadId ?? null),

    labelsFor: (refs) =>
      answer(() =>
        data.messageLabels
          .filter((ml) => inRefs(refs, ml))
          .flatMap((ml) => {
            const l = data.labels.find((row) => row.id === ml.labelId);
            // Inner join: an attachment to a label that no longer exists is
            // invisible, as it is in Postgres.
            return l
              ? [
                  {
                    accountId: ml.accountId,
                    gmailMessageId: ml.gmailMessageId,
                    labelId: l.id,
                    name: l.name,
                    gmailLabelId: l.gmailLabelId,
                    colorBg: l.colorBg,
                    colorFg: l.colorFg,
                  },
                ]
              : [];
          }),
      ),

    attachmentsFor: (refs) => answer(() => data.attachments.filter((a) => inRefs(refs, a))),

    attachLabels: ({ accountId, gmailMessageIds, labelIds }) =>
      answer(() => {
        for (const gmailMessageId of gmailMessageIds) {
          for (const labelId of labelIds) {
            const already = data.messageLabels.some(
              (ml) =>
                ml.accountId === accountId &&
                ml.gmailMessageId === gmailMessageId &&
                ml.labelId === labelId,
            );
            if (!already) data.messageLabels.push({ accountId, gmailMessageId, labelId });
          }
        }
      }),

    detachLabels: ({ accountId, gmailMessageIds, labelIds }) =>
      answer(() => {
        // Removed in place: a suite holds on to these arrays, so replacing one
        // would leave it asserting against rows nothing writes to any more.
        const kept = data.messageLabels.filter(
          (ml) =>
            !(
              ml.accountId === accountId &&
              gmailMessageIds.includes(ml.gmailMessageId) &&
              labelIds.includes(ml.labelId)
            ),
        );
        data.messageLabels.splice(0, data.messageLabels.length, ...kept);
      }),

    setFlagsForMessages: ({ accountId, gmailMessageIds, flags }) =>
      answer(() => {
        for (const m of data.messages) {
          if (m.accountId === accountId && gmailMessageIds.includes(m.gmailMessageId)) {
            applyFlags(m, flags);
          }
        }
      }),

    setFlagsForThread: ({ accountId, gmailThreadId, flags }) =>
      answer(() => {
        for (const m of data.messages) {
          if (m.accountId === accountId && m.gmailThreadId === gmailThreadId) {
            applyFlags(m, flags);
          }
        }
      }),

    accounts: () => answer(() => data.accounts.toSorted((a, b) => (a.email < b.email ? -1 : 1))),

    accountById: (id) => answer(() => data.accounts.find((a) => a.id === id) ?? null),

    accountByEmail: (email) => answer(() => data.accounts.find((a) => a.email === email) ?? null),
  };

  const triageStore: TriageStoreImpl = {
    historyFor: (ref) =>
      answer(() =>
        data.triages
          .filter((t) => sameRef(t, ref))
          .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),

    byId: (triageId) => answer(() => data.triages.find((t) => t.id === triageId) ?? null),

    insert: (row) =>
      answer(() => {
        data.triages.push(
          triage({
            id: `triage-${data.triages.length + 1}`,
            accountId: row.accountId,
            gmailMessageId: row.gmailMessageId,
            priority: row.priority,
            reasoning: row.reasoning,
            model: row.model ?? null,
            // Later than everything seeded, so "the newest triage wins" holds
            // without a suite having to stamp one.
            createdAt: new Date(EPOCH.getTime() + data.triages.length + 1),
          }),
        );
      }),

    existingSuggestionsFor: (triageIds) =>
      answer(() =>
        data.existingSuggestions
          .filter((s) => triageIds.includes(s.triageId))
          .flatMap((s) => {
            const l = data.labels.find((row) => row.id === s.labelId);
            return l
              ? [
                  {
                    triageId: s.triageId,
                    labelId: s.labelId,
                    status: s.status,
                    name: l.name,
                    colorBg: l.colorBg,
                    colorFg: l.colorFg,
                  },
                ]
              : [];
          }),
      ),

    newSuggestionsFor: (triageIds) =>
      answer(() => data.newSuggestions.filter((s) => triageIds.includes(s.triageId))),

    markExistingApplied: ({ triageId, labelIds }) =>
      answer(() => {
        for (const s of data.existingSuggestions) {
          if (s.triageId === triageId && labelIds.includes(s.labelId)) s.status = "applied";
        }
      }),

    markNewApplied: ({ suggestionId, createdLabelId }) =>
      answer(() => {
        for (const s of data.newSuggestions) {
          if (s.suggestionId === suggestionId) {
            s.status = "applied";
            s.createdLabelId = createdLabelId;
          }
        }
      }),

    dismissPending: ({ triageId }) =>
      answer(() => {
        for (const s of data.existingSuggestions) {
          if (s.triageId === triageId && s.status === "pending") s.status = "dismissed";
        }
        for (const s of data.newSuggestions) {
          if (s.triageId === triageId && s.status === "pending") s.status = "dismissed";
        }
      }),
  };

  const labelStore: LabelStoreImpl = {
    byAccount: (accountId) => answer(() => data.labels.filter((l) => l.accountId === accountId)),

    byIds: ({ accountId, ids }) =>
      answer(() => data.labels.filter((l) => l.accountId === accountId && ids.includes(l.id))),

    byGmailIds: ({ accountId, gmailLabelIds }) =>
      answer(() =>
        data.labels.filter(
          (l) => l.accountId === accountId && gmailLabelIds.includes(l.gmailLabelId),
        ),
      ),

    byName: ({ accountId, name }) =>
      answer(() => data.labels.find((l) => l.accountId === accountId && l.name === name) ?? null),

    upsert: (rows) =>
      answer(() =>
        rows.map((row) => {
          const existing = data.labels.find(
            (l) => l.accountId === row.accountId && l.gmailLabelId === row.gmailLabelId,
          );
          if (existing) {
            existing.name = row.name;
            existing.type = row.type;
            existing.colorBg = row.colorBg;
            existing.colorFg = row.colorFg;
            return existing;
          }
          const created: StoredLabel = { id: freshLabelId(), ...row };
          data.labels.push(created);
          return created;
        }),
      ),
  };

  /** The message a promo hangs off, if it is still one the inbox shows. */
  const listableMessage = (row: StoredPromoCode) =>
    data.messages.find(
      (m) => sameRef(m, row) && !m.isArchived && !m.isTrashed && m.removedAt === null,
    );

  const promoStore: PromoStoreImpl = {
    insert: (rows) =>
      answer(() =>
        rows.map((row) => {
          const stored = promo({ ...row, id: crypto.randomUUID(), createdAt: new Date() });
          data.promos.push(stored);
          return copyOf(stored);
        }),
      ),

    byId: (id) =>
      answer(() => {
        const row = data.promos.find((p) => p.id === id);
        return row ? copyOf(row) : null;
      }),

    unsaved: (filter) =>
      answer(() =>
        data.promos
          .flatMap((p) => {
            if (p.savedAt !== null || p.accountId !== filter.accountId) return [];
            const mail = listableMessage(p);
            if (!mail) return [];
            if (filter.internalDateFrom && mail.internalDate < filter.internalDateFrom) return [];
            if (filter.internalDateTo && mail.internalDate >= filter.internalDateTo) return [];
            return [{ promo: p, internalDate: mail.internalDate }];
          })
          .toSorted((a, b) => b.internalDate.getTime() - a.internalDate.getTime())
          .map((row) => copyOf(row.promo)),
      ),

    // The account is joined, not looked up by the caller: a saved row names the
    // mailbox it arrived in, and an inner join is what Postgres does — so a
    // promo whose account is gone is gone here too.
    saved: () =>
      answer(() =>
        data.promos
          .flatMap((p) => {
            if (p.savedAt === null) return [];
            const owner = data.accounts.find((a) => a.id === p.accountId);
            return owner ? [{ ...copyOf(p), accountEmail: owner.email }] : [];
          })
          .toSorted((a, b) => b.savedAt!.getTime() - a.savedAt!.getTime()),
      ),

    markSaved: ({ id, savedAt, message: copy }) =>
      answer(() => {
        const row = data.promos.find((p) => p.id === id);
        if (row) Object.assign(row, { savedAt }, copy);
      }),

    patch: ({ id, fields }) =>
      answer(() => {
        const row = data.promos.find((p) => p.id === id);
        if (!row) return;
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) row[key as keyof PromoFields] = value as never;
        }
      }),

    remove: (id) =>
      answer(() => {
        const index = data.promos.findIndex((p) => p.id === id);
        if (index < 0) return 0;
        data.promos.splice(index, 1);
        return 1;
      }),

    removeUnsavedForMessage: (ref) =>
      answer(() => {
        const doomed = data.promos.filter((p) => sameRef(ref, p) && p.savedAt === null);
        for (const row of doomed) data.promos.splice(data.promos.indexOf(row), 1);
        return doomed.length;
      }),
  };

  return Object.assign(data, { add, messageStore, triageStore, labelStore, promoStore });
}

function applyFlags(row: MailboxMessageRow, flags: MessageFlags): void {
  if (flags.isArchived !== undefined) row.isArchived = flags.isArchived;
  if (flags.isTrashed !== undefined) row.isTrashed = flags.isTrashed;
}
