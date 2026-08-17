import type { QueryClient } from "@tanstack/react-query";
import { useQueries, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import { CREDENTIAL_PROVIDERS, isHostedProvider } from "@miel/core/providerModels";
import type { CredentialProvider, Provider, ProviderCredentialStatus } from "./types";

// Pure option factories for the hosted-API-key hooks, extracted so the request
// shapes and the cache writes can be unit-tested without a DOM render (mirrors
// schedule.hooks.ts).
//
// The write factories are bound to a component in exactly one place —
// `useCredential`, which owns a credential's whole lifecycle (#135). The
// per-verb `use…` wrappers that used to live here went with the tile family
// that called them; what stays is the two reads that are nobody's lifecycle,
// the roster a model picker needs and the single status the gate asks for.
//
// The key travels one way: it goes out in a PUT body and is never stored in the
// query cache — what comes back, and all these hooks ever hold, is presence
// plus a masked hint.

export interface SetProviderCredentialInput {
  apiKey: string;
}

export function providerCredentialQueryOptions(provider: CredentialProvider) {
  return {
    queryKey: queryKeys.providerCredential(provider),
    queryFn: async () =>
      apiFetch<ProviderCredentialStatus>({ path: `/settings/provider-credentials/${provider}` }),
  };
}

export function setProviderCredentialMutationOptions(
  qc: QueryClient,
  provider: CredentialProvider,
) {
  return {
    mutationFn: async (input: SetProviderCredentialInput) =>
      apiFetch<ProviderCredentialStatus>({
        path: `/settings/provider-credentials/${provider}`,
        method: "PUT" as const,
        body: input,
      }),
    onSuccess: (data: ProviderCredentialStatus) => {
      qc.setQueryData(queryKeys.providerCredential(provider), data);
    },
  };
}

export function deleteProviderCredentialMutationOptions(
  qc: QueryClient,
  provider: CredentialProvider,
) {
  return {
    mutationFn: async () =>
      apiFetch<ProviderCredentialStatus>({
        path: `/settings/provider-credentials/${provider}`,
        method: "DELETE" as const,
      }),
    onSuccess: (data: ProviderCredentialStatus) => {
      qc.setQueryData(queryKeys.providerCredential(provider), data);
    },
  };
}

/**
 * The same query for a provider that may be the local CLI (#105). The CLI has
 * no credential row — `/settings/provider-credentials/claude-code` is a 400 —
 * so the fetch is disabled rather than made and swallowed.
 */
export function providerCredentialStatusQueryOptions(provider: Provider) {
  return {
    ...providerCredentialQueryOptions(provider as CredentialProvider),
    enabled: isHostedProvider(provider),
  };
}

/**
 * Which vendors currently have a key stored — the whole roster in one answer,
 * from the same per-provider queries the tiles read, so the two never disagree
 * and no extra request is made.
 *
 * A model row needs this rather than its own provider's status alone: since the
 * provider select only offers what can actually run, building its options means
 * knowing about every vendor, not just the selected one.
 *
 * `pending` is its own flag rather than an empty roster. "No vendor is
 * configured" and "nobody has answered yet" produce the same set but call for
 * different UI — the first is a one-option select, the second a disabled one.
 */
export interface ProviderCredentialRoster {
  configured: ReadonlySet<CredentialProvider>;
  pending: boolean;
}

export function useProviderCredentials(): ProviderCredentialRoster {
  const results = useQueries({
    queries: CREDENTIAL_PROVIDERS.map((provider) => providerCredentialQueryOptions(provider)),
  });

  const configured = new Set<CredentialProvider>();
  CREDENTIAL_PROVIDERS.forEach((provider, i) => {
    if (results[i]?.data?.configured) configured.add(provider);
  });

  return { configured, pending: results.some((r) => r.isPending) };
}

export function useProviderCredentialFor(provider: Provider) {
  return useQuery(providerCredentialStatusQueryOptions(provider));
}
