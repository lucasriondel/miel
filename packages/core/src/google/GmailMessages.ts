/**
 * `GmailMessages` — search / get / send against `users.messages.*`.
 *
 * `search` → `messages.list(q)`; `get` → `messages.get(format=full)` whose
 * response IS the `payload` tree the existing `GogMessageRaw` schema models, so
 * downstream body/attachment extraction (`util/gmailPayload`) works unchanged;
 * `send` → `messages.send(raw, threadId)` for in-thread replies, or
 * `messages.send(raw)` with no thread for a new message.
 */
import { Effect, Layer } from "effect";
import { google } from "googleapis";
import { GmailParseError, GmailSendError } from "../errors";
import { GogMessageRaw } from "../schemas/gmail";
import { createDebug } from "../util/debug";
import { gmailRefusalDetail, toGmailError } from "./gmailErrors";
import { buildMimeMessage, buildRawMessage, type Rfc822Input } from "./rfc822";
import {
  GmailMessages,
  GoogleAuth,
  refKey,
  type GmailMessagesImpl,
  type SearchHit,
  type SendMessageInput,
  type SendResult,
} from "./contracts";

/** The MIME builder's input for an outgoing message. */
export const mimeInputOf = (msg: SendMessageInput): Rfc822Input => ({
  to: msg.to,
  cc: msg.cc,
  bcc: msg.bcc,
  from: msg.from,
  subject: msg.subject,
  body: msg.body,
  html: msg.html,
  attachments: msg.attachments,
  inReplyTo: msg.inReplyToHeader,
  messageId: msg.messageId,
});

/**
 * How the message travels. A message with attachments goes through Gmail's
 * media upload (`message/rfc822`), which takes up to 35 MB; the JSON `raw`
 * field is for the small ones, and is what every send without a file has
 * always used.
 */
export const usesMediaUpload = (msg: SendMessageInput): boolean =>
  (msg.attachments?.length ?? 0) > 0;

const debug = createDebug("google:messages");

const impl: GmailMessagesImpl = {
  search: (ref, query, max = 50) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
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
      const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
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
      const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
      const gmail = google.gmail({ version: "v1", auth });
      const input = mimeInputOf(msg);
      const res = yield* Effect.tryPromise({
        try: () =>
          usesMediaUpload(msg)
            ? gmail.users.messages.send({
                userId: "me",
                requestBody: msg.threadId ? { threadId: msg.threadId } : {},
                media: { mimeType: "message/rfc822", body: buildMimeMessage(input) },
              })
            : gmail.users.messages.send({
                userId: "me",
                // No threadId is a new message: Gmail starts a thread for it.
                requestBody: msg.threadId
                  ? { raw: buildRawMessage(input), threadId: msg.threadId }
                  : { raw: buildRawMessage(input) },
              }),
        catch: (cause) => new GmailSendError({ cause, detail: gmailRefusalDetail(cause) }),
      });
      const result: SendResult = {
        messageId: res.data.id ?? "",
        threadId: res.data.threadId ?? msg.threadId ?? "",
      };
      debug("send done", { ref: key, sentMessageId: result.messageId });
      return result;
    }),

  getAttachment: (ref, messageId, attachmentId) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
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

  metadata: (ref, messageId, headerNames) => metadata(ref, messageId, headerNames),
};

const metadata: GmailMessagesImpl["metadata"] = (ref, messageId, headerNames) =>
  Effect.gen(function* () {
    const key = refKey(ref);
    const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
    const gmail = google.gmail({ version: "v1", auth });
    const res = yield* Effect.tryPromise({
      try: () =>
        gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "metadata",
          metadataHeaders: [...headerNames],
        }),
      catch: (err) => toGmailError("messages.get(metadata)", key, err),
    });
    const headers: Record<string, string> = {};
    for (const h of res.data.payload?.headers ?? []) {
      if (h.name && typeof h.value === "string") headers[h.name.toLowerCase()] = h.value;
    }
    return {
      id: res.data.id ?? messageId,
      threadId: res.data.threadId ?? "",
      internalDate: new Date(Number(res.data.internalDate ?? Date.now())),
      headers,
    };
  });

function decodeBase64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded + "===".slice((padded.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const GmailMessagesLive = Layer.succeed(GmailMessages, impl);
