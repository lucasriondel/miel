/**
 * `GmailThreads` — trash / archive against `users.threads.modify`.
 *
 * Trash = add TRASH + remove INBOX; archive = remove INBOX. Matches the old gog
 * `thread modify` argv semantics exactly. The two undos are the same calls read
 * backwards — unarchive adds INBOX, untrash removes TRASH and adds INBOX — so a
 * round trip leaves the thread's labels where they started. Untrash is a modify
 * rather than `threads.untrash` for that reason: the REST untrash only lifts
 * TRASH, and the INBOX miel's trash took away would stay gone.
 */
import { Effect, Layer } from "effect";
import { google } from "googleapis";
import { createDebug } from "../util/debug";
import { toGmailError } from "./gmailErrors";
import { GmailThreads, GoogleAuth, refKey, type GmailThreadsImpl } from "./contracts";

const debug = createDebug("google:threads");

function modify(
  ref: Parameters<GmailThreadsImpl["trash"]>[0],
  threadId: string,
  op: string,
  add: string[],
  remove: string[],
) {
  return Effect.gen(function* () {
    const key = refKey(ref);
    const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
    const gmail = google.gmail({ version: "v1", auth });
    yield* Effect.tryPromise({
      try: () =>
        gmail.users.threads.modify({
          userId: "me",
          id: threadId,
          requestBody: { addLabelIds: add, removeLabelIds: remove },
        }),
      catch: (err) => toGmailError(op, key, err),
    });
    debug(`${op} done`, { ref: key, threadId });
  });
}

const impl: GmailThreadsImpl = {
  trash: (ref, threadId) => modify(ref, threadId, "threads.trash", ["TRASH"], ["INBOX"]),
  archive: (ref, threadId) => modify(ref, threadId, "threads.archive", [], ["INBOX"]),
  unarchive: (ref, threadId) => modify(ref, threadId, "threads.unarchive", ["INBOX"], []),
  untrash: (ref, threadId) => modify(ref, threadId, "threads.untrash", ["INBOX"], ["TRASH"]),
};

export const GmailThreadsLive = Layer.succeed(GmailThreads, impl);
