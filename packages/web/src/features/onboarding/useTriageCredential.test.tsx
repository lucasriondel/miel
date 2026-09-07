// Which credential the onboarding gate has to look at, given which provider
// runs triage (#111). The local provider authenticates with a token and the
// three vendors with an API key, and those are different routes — so "does
// triage have a credential" is one question with two lookups behind it.
//
// This package has no DOM harness, so the hook is read through a probe
// component rendered to static markup with the answers already in the cache.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTriageCredential } from "./useTriageCredential";
import { queryKeys } from "../../api/queries";
import type { ClaudeCodeTokenStatus, Provider, ProviderCredentialStatus } from "../../api/types";

const Probe = ({ provider }: { provider: Provider | undefined }) => {
  const state = useTriageCredential(provider);
  return (
    <span>
      settled={String(state.data !== undefined)} configured={String(state.data?.configured)}
    </span>
  );
};

interface Seed {
  token?: ClaudeCodeTokenStatus;
  keys?: Partial<Record<string, ProviderCredentialStatus>>;
}

const read = (provider: Provider | undefined, seed: Seed = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed.token) qc.setQueryData(queryKeys.claudeCodeToken, seed.token);
  for (const [vendor, status] of Object.entries(seed.keys ?? {})) {
    qc.setQueryData(queryKeys.providerCredential(vendor), status);
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <Probe provider={provider} />
    </QueryClientProvider>,
  );
};

const STORED_TOKEN: ClaudeCodeTokenStatus = { configured: true, hint: "sk-ant-…o4t" };
const NO_TOKEN: ClaudeCodeTokenStatus = { configured: false, hint: null };

describe("useTriageCredential", () => {
  test("has no answer at all until the settings say which provider triages", () => {
    // Not "unconfigured": a gate that guessed here would open over an install
    // whose settings request is merely slow.
    expect(read(undefined, { token: STORED_TOKEN })).toContain("settled=false");
  });

  test("reads the local provider's token when that is what triages", () => {
    expect(read("claude-code", { token: STORED_TOKEN })).toContain("configured=true");
    expect(read("claude-code", { token: NO_TOKEN })).toContain("configured=false");
  });

  test("reads the selected vendor's key when a hosted provider triages", () => {
    const seed = {
      token: NO_TOKEN,
      keys: {
        anthropic: { provider: "anthropic" as const, configured: true, hint: "sk-ant-…3f9" },
        openai: { provider: "openai" as const, configured: false, hint: null },
      },
    };

    // The token being absent says nothing about a vendor that runs over HTTP.
    expect(read("anthropic", seed)).toContain("configured=true");
    expect(read("openai", seed)).toContain("configured=false");
  });

  test("does not answer from another vendor's key", () => {
    const html = read("google", {
      keys: { anthropic: { provider: "anthropic", configured: true, hint: "sk-ant-…3f9" } },
    });

    expect(html).toContain("settled=false");
  });
});
