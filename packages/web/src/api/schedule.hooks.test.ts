import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  scheduleQueryOptions,
  scheduleStatusQueryOptions,
  updateScheduleMutationOptions,
} from "./schedule.hooks";

// Captures requests by stubbing `fetch`, not by module-mocking `./client`, for
// the reason `filters.hooks.test.ts` gives: a module mock is process-global and
// owns `apiFetch` for every module loaded after it, so whichever suite
// registered one decided what its siblings were exercising — and test files are
// not loaded in a guaranteed order. The real client also proves the URL the API
// receives.
const originalFetch = globalThis.fetch;

interface Captured {
  url: string;
  method: string | undefined;
  body: unknown;
}

let calls: Captured[] = [];

// `apiFetch` resolves the path-only base against the window's origin, and the
// origin is the DOM harness's (#129) rather than one this file builds.
const API = `${window.location.origin}/api`;

function stubFetch(body: unknown = {}) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  stubFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("scheduleQueryOptions", () => {
  test("keys on the schedule query key and GETs the settings", async () => {
    const opts = scheduleQueryOptions();
    expect(opts.queryKey).toEqual(["settings", "schedule"]);

    stubFetch({ enabled: true, intervalMinutes: 30, since: "6h" });
    const result = await opts.queryFn();

    expect(calls.map((c) => `${c.method ?? "GET"} ${c.url}`)).toEqual([
      `GET ${API}/settings/schedule`,
    ]);
    expect(result).toEqual({ enabled: true, intervalMinutes: 30, since: "6h" });
  });
});

describe("scheduleStatusQueryOptions", () => {
  test("keys on the status key, GETs status, and polls", async () => {
    const opts = scheduleStatusQueryOptions();
    expect(opts.queryKey).toEqual(["settings", "schedule", "status"]);
    expect(opts.refetchInterval).toBe(15_000);

    await opts.queryFn();
    expect(calls[0]?.url).toBe(`${API}/settings/schedule/status`);
  });
});

describe("updateScheduleMutationOptions", () => {
  test("PUTs the partial payload to /settings/schedule", async () => {
    const qc = new QueryClient();
    const opts = updateScheduleMutationOptions(qc);

    stubFetch({ enabled: true, intervalMinutes: 15, since: "24h" });
    await opts.mutationFn({ enabled: true });

    expect(calls).toEqual([
      {
        url: `${API}/settings/schedule`,
        method: "PUT",
        body: { enabled: true },
      },
    ]);
  });

  test("onSuccess writes the resolved settings into the query cache", () => {
    const qc = new QueryClient();
    const opts = updateScheduleMutationOptions(qc);

    const resolved = { enabled: false, intervalMinutes: 60, since: "7d" };
    opts.onSuccess(resolved);

    const cached = qc.getQueryData<typeof resolved>(["settings", "schedule"]);
    expect(cached).toEqual(resolved);
  });
});
