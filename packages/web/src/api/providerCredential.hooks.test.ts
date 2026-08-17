import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  deleteProviderCredentialMutationOptions,
  providerCredentialQueryOptions,
  setProviderCredentialMutationOptions,
} from "./providerCredential.hooks";
import type { ProviderCredentialStatus } from "./types";

// Stubs `fetch` rather than mocking `./client`: a module mock of the shared api
// client is process-global and bleeds into sibling suites (same reasoning as
// filters.hooks.test), and going through the real `apiFetch` also proves the
// route the key is actually PUT to.
const originalFetch = globalThis.fetch;

interface Captured {
  url: string;
  method: string | undefined;
  body: unknown;
}

function stubFetch(body: unknown, status = 200): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const STATUS: ProviderCredentialStatus = {
  provider: "anthropic",
  configured: true,
  hint: "sk-ant-…3f9",
};
const CLEARED: ProviderCredentialStatus = {
  provider: "anthropic",
  configured: false,
  hint: null,
};
const CACHE_KEY = ["settings", "provider-credentials", "anthropic"] as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("providerCredentialQueryOptions", () => {
  test("keys per provider and GETs that provider's status", async () => {
    const calls = stubFetch(STATUS);
    const opts = providerCredentialQueryOptions("anthropic");

    expect(opts.queryKey).toEqual(CACHE_KEY);
    expect(await opts.queryFn()).toEqual(STATUS);
    expect(calls[0]!.url).toContain("/settings/provider-credentials/anthropic");
  });
});

describe("setProviderCredentialMutationOptions", () => {
  test("PUTs the key and writes the returned status into the cache", async () => {
    const calls = stubFetch(STATUS);
    const qc = new QueryClient();
    const opts = setProviderCredentialMutationOptions(qc, "anthropic");

    opts.onSuccess(await opts.mutationFn({ apiKey: "sk-ant-api03-abcdefghijk3f9" }));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toContain("/settings/provider-credentials/anthropic");
    expect(calls[0]!.body).toEqual({ apiKey: "sk-ant-api03-abcdefghijk3f9" });
    expect(qc.getQueryData<ProviderCredentialStatus>(CACHE_KEY)).toEqual(STATUS);
  });

  test("never caches the key itself — only the status the server returned", async () => {
    stubFetch(STATUS);
    const qc = new QueryClient();
    const opts = setProviderCredentialMutationOptions(qc, "anthropic");

    opts.onSuccess(await opts.mutationFn({ apiKey: "sk-ant-secret-value-3f9" }));

    expect(JSON.stringify(qc.getQueryData<ProviderCredentialStatus>(CACHE_KEY))).not.toContain(
      "sk-ant-secret-value-3f9",
    );
  });
});

describe("deleteProviderCredentialMutationOptions", () => {
  test("DELETEs and caches the cleared status", async () => {
    const calls = stubFetch(CLEARED);
    const qc = new QueryClient();
    const opts = deleteProviderCredentialMutationOptions(qc, "anthropic");

    opts.onSuccess(await opts.mutationFn());

    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toContain("/settings/provider-credentials/anthropic");
    expect(qc.getQueryData<ProviderCredentialStatus>(CACHE_KEY)).toEqual(CLEARED);
  });
});
