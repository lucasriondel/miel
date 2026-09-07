/**
 * `GmailThreads` — trash / archive against `users.threads.modify`.
 *
 * Trash = add TRASH + remove INBOX; archive = remove INBOX. Matches the old gog
 * `thread modify` argv semantics exactly.
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
    const auth = yield* GoogleAuth.clientFor(ref);
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
};

export const GmailThreadsLive = Layer.succeed(GmailThreads, impl);
