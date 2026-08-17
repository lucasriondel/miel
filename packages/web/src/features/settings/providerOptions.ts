import { PROVIDERS, isHostedProvider, type Provider } from "@miel/core/providerModels";
import type { CredentialProvider } from "../../api/types";

/**
 * Which providers a model row may offer, given what is stored.
 *
 * The select used to list the whole catalogue and repair the choice afterwards:
 * pick a vendor with no key, get a key field in the row, save both. That put the
 * precondition after the choice — and every option but one was a dead end the
 * settings route would refuse with `missing_provider_credential`. Credentials
 * now sit above the models, and the select offers what can actually run.
 *
 * Three rules, in the order they matter:
 *
 * - `claude-code` is always offered. It is a local subprocess and the app's
 *   `DEFAULT_PROVIDER`; its token living in `encrypted_secrets` is a run-time
 *   failure to report, not a reason to hide the option a fresh install is
 *   already using.
 * - A vendor is offered once its key is stored.
 * - The saved provider is always offered, key or not. Dropping it would leave
 *   the select displaying a provider the server never stored — the row would
 *   silently claim a task runs somewhere it does not. Keep it; the row flags it
 *   and points at the credential.
 *
 * Order follows the catalogue, so the local provider comes first and a provider
 * added there shows up here with no second edit.
 */
export function providerOptions(
  saved: Provider,
  configured: ReadonlySet<CredentialProvider>,
): readonly Provider[] {
  return PROVIDERS.filter(
    (p) => !isHostedProvider(p) || p === saved || configured.has(p as CredentialProvider),
  );
}
