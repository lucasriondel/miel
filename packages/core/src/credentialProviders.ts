/**
 * The LLM vendors miel can hold an API key for (#104).
 *
 * A leaf module with no imports, like `claudeUsage.ts` and `appBasePath.ts`:
 * both the Zod request schemas and `services/encryptedSecrets.ts` need this
 * list, and a schema module has no business pulling in the db client to get it.
 *
 * One entry per vendor miel can talk to over HTTP. `providerModels.ts` builds
 * the pickable-provider list out of this plus the local `claude-code` CLI, so a
 * vendor added here becomes selectable once it also has a model list and an
 * ai-sdk factory in `ai-task-runner-effect`'s hosted transport (#105).
 */
export const CREDENTIAL_PROVIDERS = ["anthropic", "google", "openai"] as const;
export type CredentialProvider = (typeof CREDENTIAL_PROVIDERS)[number];

export function isCredentialProvider(value: string): value is CredentialProvider {
  return (CREDENTIAL_PROVIDERS as readonly string[]).includes(value);
}
