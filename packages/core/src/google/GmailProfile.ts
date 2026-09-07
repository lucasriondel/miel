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
} from "./contracts";

const debug = createDebug("google:profile");

const impl: GmailProfileImpl = {
  profile: (ref) =>
    Effect.gen(function* () {
      const key = refKey(ref);
      const auth = yield* GoogleAuth.clientFor(ref);
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
};

export const GmailProfileLive = Layer.succeed(GmailProfile, impl);
