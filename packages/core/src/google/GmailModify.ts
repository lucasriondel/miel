/**
 * `GmailModify` — batch add/remove labels on messages via
 * `users.messages.batchModify`. No-op (no API call) when the id list is empty,
 * matching the old gog adapter's guard.
 */
import { Effect, Layer } from "effect";
import { google } from "googleapis";
import { createDebug } from "../util/debug";
import { toGmailError } from "./gmailErrors";
import { GmailModify, GoogleAuth, refKey, type GmailModifyImpl } from "./contracts";

const debug = createDebug("google:modify");

const impl: GmailModifyImpl = {
  batch: (ref, messageIds, add, remove) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      if (messageIds.length === 0) {
        debug("batch noop (no messages)", { ref: key });
        return;
      }
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      yield* Effect.tryPromise({
        try: () =>
          gmail.users.messages.batchModify({
            userId: "me",
            requestBody: {
              ids: messageIds,
              addLabelIds: add && add.length > 0 ? add : undefined,
              removeLabelIds: remove && remove.length > 0 ? remove : undefined,
            },
          }),
        catch: (err) => toGmailError("messages.batchModify", key, err),
      });
      debug("batch done", {
        ref: key,
        count: messageIds.length,
        add: add ?? [],
        remove: remove ?? [],
      });
    }),
};

export const GmailModifyLive = Layer.succeed(GmailModify, impl);
