/**
 * The AI vendors the copy has to name, read from core's catalogue rather than
 * restated here (#114).
 *
 * `CREDENTIAL_PROVIDERS` is the single definition of which vendors Miel can
 * hold an API key for, and `PROVIDER_LABELS` is how each one is spelled in the
 * app — so a vendor added to core arrives here already named the way the
 * settings picker names it. This is the same rule the triage-batch disclosure
 * follows: the figures and the vendor list are facts about the code, and the
 * page quotes them instead of keeping a copy.
 *
 * The prose itself stays hand-written. Each page bends these names into its own
 * sentence — "Anthropic's, Google's or OpenAI's" on the privacy page — so the
 * point of deriving the list is that the copy tests fail until someone writes a
 * fourth vendor into those sentences, not that the sentences write themselves.
 *
 * `@miel/core/providerModels` is a leaf subpath whose only import is
 * `credentialProviders`, itself a leaf, so the page's build still pulls in none
 * of core's db or env code.
 */
import {
  CLAUDE_CODE_PROVIDER,
  CREDENTIAL_PROVIDERS,
  PROVIDER_LABELS,
} from "@miel/core/providerModels";

/** The HTTP vendors, each named as the app names it, in catalogue order. */
export const HOSTED_VENDOR_NAMES: readonly string[] = CREDENTIAL_PROVIDERS.map(
  (vendor) => PROVIDER_LABELS[vendor],
);

/** The local provider, which is a subprocess rather than a vendor account. */
export const LOCAL_PROVIDER_NAME: string = PROVIDER_LABELS[CLAUDE_CODE_PROVIDER];
