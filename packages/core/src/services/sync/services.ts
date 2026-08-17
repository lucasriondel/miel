import { Effect, Layer } from "effect";
import { createGmailAdapter, type GmailDataAdapter } from "../../google/gmailAdapter";
import { Claude, ClaudeLive, type ClaudeImpl } from "../../claude/Claude";
import type { Stores } from "../../stores/contracts";

/**
 * The Gmail data service used by the sync pipeline. Backed by the Effect Gmail
 * services (via the promise-facade `GmailDataAdapter`); tests provide a fake
 * adapter through `makeGmailLayer`.
 */
export class GmailService extends Effect.Service<GmailService>()("GmailService", {
  effect: Effect.sync(() => createGmailAdapter()),
}) {}

export const makeGmailLayer = (gmail?: GmailDataAdapter): Layer.Layer<GmailService> =>
  gmail ? Layer.succeed(GmailService, GmailService.make(gmail)) : GmailService.Default;

/**
 * The Claude dependency, as a layer. Sync owns no service wrapping it any more
 * (#133): the pipeline yields the `Claude` tag itself, so `claude` on the sync
 * options is one way of spelling the same injection the suites do with a layer,
 * not a second seam with an adapter type of its own.
 *
 * The live layer needs the stores; a fake needs nothing, which this return type
 * covers — a layer requiring less is usable where more is available.
 */
export const makeClaudeLayer = (claude?: ClaudeImpl): Layer.Layer<Claude, never, Stores> =>
  claude ? Layer.succeed(Claude, claude) : ClaudeLive;
