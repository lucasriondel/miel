import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  claudeCodeTokenQueryOptions,
  deleteClaudeCodeTokenMutationOptions,
  setClaudeCodeTokenMutationOptions,
} from "./claudeCodeToken.hooks";
import type { ClaudeCodeTokenStatus } from "./types";

// Stubs `fetch` rather than mocking `./client`, for the reason
// providerCredential.hooks.test does: a module mock of the shared api client is
// process-global and bleeds into sibling suites, and going through the real
// `apiFetch` also proves the route the token is actually PUT to.
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

const STORED: ClaudeCodeTokenStatus = { configured: true, hint: "sk-ant-…3f9" };
const CLEARED: ClaudeCodeTokenStatus = { configured: false, hint: null };
const CACHE_KEY = ["settings", "claude-code-token"] as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("claudeCodeTokenQueryOptions", () => {
  test("GETs the settings route, not the read-only auth status", async () => {
    const calls = stubFetch(STORED);
    const opts = claudeCodeTokenQueryOptions();

    expect(opts.queryKey).toEqual(CACHE_KEY);
    expect(await opts.queryFn()).toEqual(STORED);
    expect(calls[0]!.url).toContain("/settings/claude-code-token");
  });
});

describe("setClaudeCodeTokenMutationOptions", () => {
  test("PUTs the token and writes the returned status into the cache", async () => {
    const calls = stubFetch(STORED);
    const qc = new QueryClient();
    const opts = setClaudeCodeTokenMutationOptions(qc);

    opts.onSuccess(await opts.mutationFn({ token: "sk-ant-oat01-abcdefghijk3f9" }));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toContain("/settings/claude-code-token");
    expect(calls[0]!.body).toEqual({ token: "sk-ant-oat01-abcdefghijk3f9" });
    expect(qc.getQueryData<ClaudeCodeTokenStatus>(CACHE_KEY)).toEqual(STORED);
  });

  test("never caches the token itself — only the status the server returned", async () => {
    stubFetch(STORED);
    const qc = new QueryClient();
    const opts = setClaudeCodeTokenMutationOptions(qc);

    opts.onSuccess(await opts.mutationFn({ token: "sk-ant-oat01-secret-value-3f9" }));

    expect(JSON.stringify(qc.getQueryData<ClaudeCodeTokenStatus>(CACHE_KEY))).not.toContain(
      "sk-ant-oat01-secret-value-3f9",
    );
  });
});

describe("deleteClaudeCodeTokenMutationOptions", () => {
  // The stored token is the only one there is, so clearing it leaves nothing —
  // and the cache has to say so rather than keep the old hint on screen.
  test("DELETEs and caches the now-empty status", async () => {
    const calls = stubFetch(CLEARED);
    const qc = new QueryClient();
    const opts = deleteClaudeCodeTokenMutationOptions(qc);

    opts.onSuccess(await opts.mutationFn());

    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toContain("/settings/claude-code-token");
    expect(qc.getQueryData<ClaudeCodeTokenStatus>(CACHE_KEY)).toEqual(CLEARED);
  });
});
