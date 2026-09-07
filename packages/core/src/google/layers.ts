/**
 * Layer composition for the Google + Claude backend.
 *
 * `GoogleStack` merges the six Gmail resource services and provides them with a
 * single `GoogleAuthLive` (so the `GoogleAuth` requirement on each Gmail method
 * is satisfied once). `AppLive` adds the Claude service. Provide `AppLive` at the
 * API/CLI/sync boundary and every `*Effect` resolves its dependencies.
 */
import { Layer } from "effect";
import { GoogleAuthLive } from "./GoogleAuth";
import { GmailMessagesLive } from "./GmailMessages";
import { GmailLabelsLive } from "./GmailLabels";
import { GmailFiltersLive } from "./GmailFilters";
import { GmailThreadsLive } from "./GmailThreads";
import { GmailModifyLive } from "./GmailModify";
import { GmailProfileLive } from "./GmailProfile";
import { ClaudeLive } from "../claude/Claude";
// The Claude service reads the model settings and its provider credential, so
// the stores behind those are part of what an app-level effect needs (#132).
import { StoresLive } from "../stores/postgres";

/** Gmail services with their shared GoogleAuth dependency provided. */
export const GoogleStack = Layer.mergeAll(
  GmailMessagesLive,
  GmailLabelsLive,
  GmailFiltersLive,
  GmailThreadsLive,
  GmailModifyLive,
  GmailProfileLive,
  GoogleAuthLive, // also exported so the OAuth routes can use consentUrl/exchangeCode
).pipe(Layer.provideMerge(GoogleAuthLive));

/**
 * Everything the business services need: Google + Claude, over the stores.
 *
 * `provideMerge` rather than a flat merge because the Claude layer is built
 * *from* the stores since #133 — it captures them so no call site has to state
 * them — and they stay in the output for the services that read rows of their
 * own.
 */
export const AppLive = Layer.mergeAll(GoogleStack, ClaudeLive).pipe(Layer.provideMerge(StoresLive));
