/**
 * `GmailDrafts` — save / delete against `users.drafts.*`.
 *
 * The compose window's autosave. A draft is the same raw MIME a send builds
 * (`buildRawMessage`), wrapped: `save` creates one when no `draftId` is named
 * and replaces the named one otherwise, so a client that keeps the id it was
 * answered can call it on every pause without piling up copies. A reply draft
 * names its thread and the original's Message-ID exactly as the send would, so
 * Gmail files it in the conversation.
 *
 * All of it is covered by `gmail.modify`, the scope every account already
 * granted — no re-consent.
 */
import { Effect, Layer } from "effect";
import { google } from "googleapis";
import { createDebug } from "../util/debug";
import { toGmailError } from "./gmailErrors";
import { buildRawMessage } from "./rfc822";
import { GmailDrafts, GoogleAuth, refKey, type GmailDraftsImpl } from "./contracts";

const debug = createDebug("google:drafts");

const impl: GmailDraftsImpl = {
  save: (ref, draft) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
      const gmail = google.gmail({ version: "v1", auth });
      const { message } = draft;
      const raw = buildRawMessage({
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        subject: message.subject,
        body: message.body,
        inReplyTo: message.inReplyToHeader,
      });
      const requestBody = {
        message: message.threadId ? { raw, threadId: message.threadId } : { raw },
      };
      const draftId = draft.draftId;
      const res = yield* Effect.tryPromise({
        try: () =>
          draftId
            ? gmail.users.drafts.update({ userId: "me", id: draftId, requestBody })
            : gmail.users.drafts.create({ userId: "me", requestBody }),
        catch: (err) => toGmailError(draftId ? "drafts.update" : "drafts.create", key, err),
      });
      const saved = {
        draftId: res.data.id ?? draftId ?? "",
        messageId: res.data.message?.id ?? "",
        threadId: res.data.message?.threadId ?? message.threadId ?? "",
      };
      debug("save done", { ref: key, draftId: saved.draftId, replaced: Boolean(draftId) });
      return saved;
    }),

  delete: (ref, draftId) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
      const gmail = google.gmail({ version: "v1", auth });
      yield* Effect.tryPromise({
        try: () => gmail.users.drafts.delete({ userId: "me", id: draftId }),
        catch: (err) => toGmailError("drafts.delete", key, err),
      });
      debug("delete done", { ref: key, draftId });
    }),
};

export const GmailDraftsLive = Layer.succeed(GmailDrafts, impl);
