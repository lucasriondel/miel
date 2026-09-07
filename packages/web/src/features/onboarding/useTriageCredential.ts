import { useQuery } from "@tanstack/react-query";
import { CLAUDE_CODE_PROVIDER, isHostedProvider } from "@miel/core/providerModels";
import { claudeCodeTokenQueryOptions } from "../../api/claudeCodeToken.hooks";
import { useProviderCredentialFor } from "../../api/providerCredential.hooks";
import type { Provider } from "../../api/types";
import type { TriageCredentialGateState } from "./onboardingStep";

/** No provider yet means no question to answer — not an answer of "none". */
const UNKNOWN: TriageCredentialGateState = { isPending: true, isError: false, data: undefined };

/**
 * Whether the provider that runs triage has a credential to run on (#111).
 *
 * One question, two lookups: the local provider authenticates with a token
 * (`/settings/claude-code-token`, which also reports the environment's, so an
 * install that never pasted one still reads as configured) and each vendor with
 * its own key. Only the lookup that matches the selected provider is made — the
 * other query is disabled rather than fetched and ignored.
 *
 * `provider` is `undefined` until the settings query settles, and that is
 * deliberately not the same as "unconfigured": the gate that reads this must
 * stay shut while the answer is still unknown.
 */
export function useTriageCredential(provider: Provider | undefined): TriageCredentialGateState {
  const hosted = provider !== undefined && isHostedProvider(provider);
  const token = useQuery({
    ...claudeCodeTokenQueryOptions(),
    enabled: provider === CLAUDE_CODE_PROVIDER,
  });
  // Disabled for the local provider by `providerCredentialStatusQueryOptions`,
  // so the placeholder passed while the settings load fetches nothing.
  const key = useProviderCredentialFor(provider ?? CLAUDE_CODE_PROVIDER);

  if (provider === undefined) return UNKNOWN;
  return hosted ? key : token;
}
