// The compose window's autosave: a Gmail draft per open window.
//
// No table. The draft lives in Gmail, and its id lives in the compose window's
// own state: the first save creates one and answers its id, every later save
// names that id and replaces it, and a discard deletes it. The send endpoints
// take the same id and delete the draft once the mail is out, so a sent message
// does not leave its draft behind.
//
// Covered by `gmail.modify`, the scope every connected account already granted,
// so it costs no re-consent. The account is resolved through the store seam,
// Gmail is reached through the adapter — the two seams a suite substitutes.
import { Effect } from "effect";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { MessageStore } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { tryAsync } from "../util/effect";

const debug = createDebug("service:drafts");

export interface SaveDraftArgs {
  accountId: string;
  /** Absent creates a draft; present replaces that one. */
  draftId?: string;
  /** The message a reply draft answers, so Gmail files it in that thread. */
  replyToGmailMessageId?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  gmail?: GmailDataAdapter;
}

export interface SaveDraftResult {
  ok: true;
  draftId: string;
  /** When Gmail stored it — what "Saved to Gmail drafts · 10:41" reads. */
  savedAt: string;
}

const accountEmailEffect = (accountId: string): Effect.Effect<string, Error, MessageStore> =>
  Effect.gen(function* () {
    const account = yield* MessageStore.use((svc) => svc.accountById(accountId));
    if (!account) return yield* Effect.fail(new Error(`Account not found: ${accountId}`));
    return account.email;
  });

const cleanList = (list: readonly string[] | undefined): string[] =>
  (list ?? []).map((a) => a.trim()).filter((a) => a.length > 0);

export const saveDraftEffect = (
  args: SaveDraftArgs,
): Effect.Effect<SaveDraftResult, Error, MessageStore> =>
  Effect.gen(function* () {
    const gmail = args.gmail ?? createGmailAdapter();
    const account = yield* accountEmailEffect(args.accountId);
    // A reply draft has to name a message this account actually has, or Gmail
    // would be asked to thread it against nothing.
    const replyTo = args.replyToGmailMessageId;
    if (replyTo) {
      const thread = yield* MessageStore.use((svc) =>
        svc.threadIdOf({ accountId: args.accountId, gmailMessageId: replyTo }),
      );
      if (thread === null) return yield* Effect.fail(new Error(`Message not found: ${replyTo}`));
    }
    const cc = cleanList(args.cc);
    const bcc = cleanList(args.bcc);
    const saved = yield* tryAsync(() =>
      gmail.saveDraft({
        account,
        draftId: args.draftId,
        replyToMessageId: replyTo,
        // A draft may be saved before anyone is addressed, unlike a send.
        to: cleanList(args.to),
        ...(cc.length > 0 ? { cc } : {}),
        ...(bcc.length > 0 ? { bcc } : {}),
        subject: args.subject,
        body: args.body,
      }),
    );
    debug("saveDraft done", { draftId: saved.draftId, replaced: Boolean(args.draftId) });
    return { ok: true, draftId: saved.draftId, savedAt: new Date().toISOString() };
  });

export const deleteDraftEffect = (args: {
  accountId: string;
  draftId: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<{ ok: true }, Error, MessageStore> =>
  Effect.gen(function* () {
    const gmail = args.gmail ?? createGmailAdapter();
    const account = yield* accountEmailEffect(args.accountId);
    yield* tryAsync(() => gmail.deleteDraft({ account, draftId: args.draftId }));
    debug("deleteDraft done", { draftId: args.draftId });
    return { ok: true } as const;
  });

// Promise facades for the API/CLI boundary.
export async function saveDraft(args: SaveDraftArgs): Promise<SaveDraftResult> {
  return runWithStores(saveDraftEffect(args));
}

export async function deleteDraft(args: {
  accountId: string;
  draftId: string;
  gmail?: GmailDataAdapter;
}): Promise<{ ok: true }> {
  return runWithStores(deleteDraftEffect(args));
}
