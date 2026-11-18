/**
 * `GmailProfile` — display name + avatar + canonical email for a connected
 * account, via `oauth2.userinfo.get` (covered by the userinfo.* scopes). Used to
 * populate/refresh the `accounts` row's displayName/avatarUrl.
 */
import { Effect, Layer } from "effect";
import { google } from "googleapis";
import { GmailApiError } from "../errors";
import { createDebug } from "../util/debug";
import {
  GmailProfile,
  GoogleAuth,
  refKey,
  type AccountProfile,
  type GmailProfileImpl,
  type SendAsAlias,
} from "./contracts";
import { toGmailError } from "./gmailErrors";

const debug = createDebug("google:profile");

const impl: GmailProfileImpl = {
  profile: (ref) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
      const info = yield* Effect.tryPromise({
        try: () => google.oauth2({ version: "v2", auth }).userinfo.get(),
        catch: (cause) => new GmailApiError({ op: "userinfo.get", cause }),
      });
      const profile: AccountProfile = {
        email: info.data.email ?? "",
        displayName: info.data.name ?? null,
        avatarUrl: info.data.picture ?? null,
      };
      debug("profile done", { ref: key, email: profile.email });
      return profile;
    }),

  sendAs: (ref) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.use((svc) => svc.clientFor(ref));
      const res = yield* Effect.tryPromise({
        try: () =>
          google.gmail({ version: "v1", auth }).users.settings.sendAs.list({ userId: "me" }),
        catch: (err) => toGmailError("settings.sendAs.list", key, err),
      });
      const aliases: SendAsAlias[] = (res.data.sendAs ?? [])
        .filter((a) => typeof a.sendAsEmail === "string" && a.sendAsEmail.length > 0)
        .map((a) => ({
          email: a.sendAsEmail as string,
          displayName: a.displayName ? a.displayName : null,
          isPrimary: Boolean(a.isPrimary),
          isDefault: Boolean(a.isDefault),
          // The primary address carries no verification status; it is always usable.
          verified: Boolean(a.isPrimary) || a.verificationStatus === "accepted",
        }));
      debug("sendAs done", { ref: key, count: aliases.length });
      return aliases;
    }),
};

export const GmailProfileLive = Layer.succeed(GmailProfile, impl);
