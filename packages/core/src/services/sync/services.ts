import { Context, Layer } from "effect";
import { createGmailAdapter, type GmailDataAdapter } from "../../google/gmailAdapter";
import { Claude, ClaudeLive, type ClaudeImpl } from "../../claude/Claude";
import type { Stores } from "../../stores/contracts";

/**
 * The Gmail data service used by the sync pipeline. Backed by the Effect Gmail
 * services (via the promise-facade `GmailDataAdapter`); tests provide a fake
 * adapter through `makeGmailLayer`.
 */
export class GmailService extends Context.Service<GmailService, GmailDataAdapter>()(
  "GmailService",
) {
  /** The live adapter, built when the layer is, not at import. */
  static readonly layer: Layer.Layer<GmailService> = Layer.sync(this, () => createGmailAdapter());
}

export const makeGmailLayer = (gmail?: GmailDataAdapter): Layer.Layer<GmailService> =>
  gmail ? Layer.succeed(GmailService, gmail) : GmailService.layer;

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
