/**
 * `GmailFilters` — list / create / delete against `users.settings.filters.*`.
 *
 * A filter's criteria are from/to/subject/query; its action adds a label id.
 * The REST shape (`{ id, criteria, action }`) matches the existing `GogFilter`
 * schema, so downstream filter handling is unchanged.
 */
import { Effect, Layer } from "effect";
import { google } from "googleapis";
import { GmailAuthError, GmailFilterError, GmailParseError } from "../errors";
import { GogFilter } from "../schemas/gmail";
import { createDebug } from "../util/debug";
import { isAuthErr, toGmailError } from "./gmailErrors";
import {
  GmailFilters,
  GoogleAuth,
  refKey,
  type FilterSpec,
  type GmailFiltersImpl,
} from "./contracts";

const debug = createDebug("google:filters");

const impl: GmailFiltersImpl = {
  list: (ref) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      const res = yield* Effect.tryPromise({
        try: () => gmail.users.settings.filters.list({ userId: "me" }),
        catch: (err) => toGmailError("filters.list", key, err),
      });
      const list = yield* Effect.try({
        try: () => (res.data.filter ?? []).map((f) => GogFilter.parse(f)),
        catch: (cause) => new GmailParseError({ op: "filters.list", cause }),
      });
      debug("list done", { ref: key, count: list.length });
      return list;
    }),

  create: (ref, spec: FilterSpec) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      const criteria: Record<string, string> = {};
      if (spec.from) criteria.from = spec.from;
      if (spec.to) criteria.to = spec.to;
      if (spec.subject) criteria.subject = spec.subject;
      if (spec.query) criteria.query = spec.query;
      const action: {
        addLabelIds?: string[];
        removeLabelIds?: string[];
        forward?: string;
      } = {};
      const addLabelIds = spec.addLabelIds ?? (spec.addLabelId ? [spec.addLabelId] : []);
      // Gmail takes an absent key better than an empty list, so only the parts
      // of the action that carry something are sent.
      if (addLabelIds.length > 0) action.addLabelIds = addLabelIds;
      if (spec.removeLabelIds?.length) {
        action.removeLabelIds = spec.removeLabelIds;
      }
      if (spec.forward) action.forward = spec.forward;
      const res = yield* Effect.tryPromise({
        try: () =>
          gmail.users.settings.filters.create({
            userId: "me",
            requestBody: { criteria, action },
          }),
        catch: (cause) => new GmailFilterError({ cause }),
      });
      const parsed = yield* Effect.try({
        try: () => GogFilter.parse(res.data),
        catch: (cause) => new GmailFilterError({ cause }),
      });
      debug("create done", { ref: key, id: parsed.id });
      return parsed;
    }),

  delete: (ref, filterId) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
      const gmail = google.gmail({ version: "v1", auth });
      yield* Effect.tryPromise({
        try: () => gmail.users.settings.filters.delete({ userId: "me", id: filterId }),
        // A bad/expired grant is a reconnect prompt, not a filter problem —
        // everything else stays in the filter taxonomy like `create`.
        catch: (err) =>
          isAuthErr(err)
            ? new GmailAuthError({ ref: key, cause: err })
            : new GmailFilterError({ cause: err }),
      });
      debug("delete done", { ref: key, id: filterId });
    }),
};

export const GmailFiltersLive = Layer.succeed(GmailFilters, impl);
