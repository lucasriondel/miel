/**
 * `GmailMessages` — search / get / send against `users.messages.*`.
 *
 * `search` → `messages.list(q)`; `get` → `messages.get(format=full)` whose
 * response IS the `payload` tree the existing `GogMessageRaw` schema models, so
 * downstream body/attachment extraction (`util/gmailPayload`) works unchanged;
 * `send` → `messages.send(raw, threadId)` for in-thread replies.
 */
import { Effect, Layer } from "effect";
import { google } from "googleapis";
import { GmailParseError, GmailSendError } from "../errors";
import { GogMessageRaw } from "../schemas/gmail";
import { createDebug } from "../util/debug";
import { toGmailError } from "./gmailErrors";
import { buildRawMessage } from "./rfc822";
import {
  GmailMessages,
  GoogleAuth,
  refKey,
  type GmailMessagesImpl,
  type SearchHit,
  type SendResult,
} from "./contracts";

const debug = createDebug("google:messages");

const impl: GmailMessagesImpl = {
  search: (ref, query, max = 50) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      const res = yield* Effect.tryPromise({
        try: () => gmail.users.messages.list({ userId: "me", q: query, maxResults: max }),
        catch: (err) => toGmailError("messages.list", key, err),
      });
      const hits: SearchHit[] = (res.data.messages ?? [])
        .map((m) => ({
          messageId: m.id ?? "",
          threadId: m.threadId ?? m.id ?? "",
        }))
        .filter((h) => h.messageId);
      debug("search done", { ref: key, hits: hits.length });
      return hits;
    }),

  get: (ref, messageId) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      const res = yield* Effect.tryPromise({
        try: () =>
          gmail.users.messages.get({
            userId: "me",
            id: messageId,
            format: "full",
          }),
        catch: (err) => toGmailError("messages.get", key, err),
      });
      // The REST `messages.get(full)` body is exactly the GogMessageRaw shape
      // (id/threadId/labelIds/snippet/internalDate/payload).
      const parsed = yield* Effect.try({
        try: () => GogMessageRaw.parse(res.data),
        catch: (cause) => new GmailParseError({ op: "messages.get", cause }),
      });
      debug.trace("get done", { ref: key, messageId });
      return parsed;
    }),

  send: (ref, msg) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      const raw = buildRawMessage({
        to: msg.to,
        cc: msg.cc,
        subject: msg.subject,
        body: msg.body,
        inReplyTo: msg.inReplyToHeader,
      });
      const res = yield* Effect.tryPromise({
        try: () =>
          gmail.users.messages.send({
            userId: "me",
            requestBody: { raw, threadId: msg.threadId },
          }),
        catch: (cause) => new GmailSendError({ cause }),
      });
      const result: SendResult = { messageId: res.data.id ?? "" };
      debug("send done", { ref: key, sentMessageId: result.messageId });
      return result;
    }),

  getAttachment: (ref, messageId, attachmentId) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      const res = yield* Effect.tryPromise({
        try: () =>
          gmail.users.messages.attachments.get({
            userId: "me",
            messageId,
            id: attachmentId,
          }),
        catch: (err) => toGmailError("messages.attachments.get", key, err),
      });
      const body = res.data as { data?: string; size?: number };
      if (typeof body.data !== "string" || body.data.length === 0) {
        return yield* Effect.fail(
          new GmailParseError({
            op: "messages.attachments.get",
            cause: new Error("missing attachment data"),
          }),
        );
      }
      const encoded = body.data;
      const decoded = yield* Effect.try({
        try: () => decodeBase64UrlToBytes(encoded),
        catch: (cause) => new GmailParseError({ op: "messages.attachments.get", cause }),
      });
      const size = typeof body.size === "number" ? body.size : decoded.length;
      debug.trace("getAttachment done", { ref: key, messageId, attachmentId, size });
      return { data: decoded, size };
    }),
};

function decodeBase64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded + "===".slice((padded.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const GmailMessagesLive = Layer.succeed(GmailMessages, impl);
