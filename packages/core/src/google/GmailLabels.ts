/**
 * `GmailLabels` — list / create against `users.labels.*`.
 */
import { Effect, Layer } from "effect";
import { google } from "googleapis";
import { GmailLabelError, GmailParseError } from "../errors";
import { GogLabel, GogLabelListResponse } from "../schemas/gmail";
import { createDebug } from "../util/debug";
import { toGmailError } from "./gmailErrors";
import { GmailLabels, GoogleAuth, refKey, type GmailLabelsImpl } from "./contracts";

const debug = createDebug("google:labels");

const impl: GmailLabelsImpl = {
  list: (ref) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      const res = yield* Effect.tryPromise({
        try: () => gmail.users.labels.list({ userId: "me" }),
        catch: (err) => toGmailError("labels.list", key, err),
      });
      const parsed = yield* Effect.try({
        try: () => GogLabelListResponse.parse(res.data),
        catch: (cause) => new GmailParseError({ op: "labels.list", cause }),
      });
      const out = Array.isArray(parsed) ? parsed : parsed.labels;
      debug("list done", { ref: key, count: out.length });
      return out;
    }),

  create: (ref, name) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      const res = yield* Effect.tryPromise({
        try: () =>
          gmail.users.labels.create({
            userId: "me",
            requestBody: { name },
          }),
        catch: (cause) => new GmailLabelError({ name, cause }),
      });
      const parsed = yield* Effect.try({
        try: () => GogLabel.parse(res.data),
        catch: (cause) => new GmailLabelError({ name, cause }),
      });
      debug("create done", { ref: key, name, id: parsed.id });
      return parsed;
    }),
};

export const GmailLabelsLive = Layer.succeed(GmailLabels, impl);
