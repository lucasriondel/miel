// The one sync event whose name changed under a live socket (#127).
//
// `sync.claude_unavailable` became `sync.provider_unavailable` because since
// #126 it fires for any provider — a keyless OpenAI included — and the client is
// the half of that rename that cannot simply switch: a browser holding this
// bundle can be talking to the previous release's API until the page reloads,
// and the event it must not miss is the one that clears the loaders which would
// otherwise spin forever. So the client understands both names for one release,
// and this suite pins that both do the same thing.
//
// Rendered into the DOM harness (#129) rather than read as source: what is
// asserted is what a user is left looking at — the triage loader gone, the
// sentence that names the fix, and the button that goes there.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MielToaster } from "../components/MielToaster";
import { useSyncStream } from "./syncSocket";

const ACCOUNT = "user@example.com";

/**
 * The one seam: the transport. Everything above it — the hook, the Zod parse,
 * the dispatch and the toasts — is the real thing, and the frames below are the
 * bytes a server sends.
 */
class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 1;
  sent: string[] = [];
  private listeners = new Map<string, Array<(ev: unknown) => void>>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (ev: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.fire("close", {});
  }

  /** A server frame, delivered the way the browser delivers one. */
  receive(event: unknown) {
    this.fire("message", { data: JSON.stringify(event) });
  }

  private fire(type: string, ev: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
}

const originalWebSocket = globalThis.WebSocket;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  FakeSocket.instances = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  // Nothing here should reach the network; a query that does is a failure and
  // not a silent `{}`.
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    throw new Error(`unexpected request: ${String(input)}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  globalThis.fetch = originalFetch;
});

const SyncHarness = () => {
  const { start } = useSyncStream();
  return (
    <button type="button" onClick={() => start({})}>
      Sync
    </button>
  );
};

const UrlProbe = () => <span data-testid="path">{useLocation().pathname}</span>;

/** Mounts the hook behind a button, with the app's own toaster listening. */
function startSync(): FakeSocket {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<SyncHarness />} />
        </Routes>
        <UrlProbe />
      </MemoryRouter>
      <MielToaster />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Sync" }));
  const ws = FakeSocket.instances.at(-1);
  if (!ws) throw new Error("the hook opened no socket");
  return ws;
}

/** A triage run in flight: the loader this event exists to clear. */
function triageRunning(ws: FakeSocket) {
  act(() => {
    ws.receive({ type: "triage.started", account: ACCOUNT, totalBatches: 2 });
  });
}

describe("the provider-unavailable event reaches the user (#127)", () => {
  test("the new name clears the hung loader and names the fix", async () => {
    const ws = startSync();
    triageRunning(ws);
    await screen.findByText("AI is triaging your mails…");

    act(() => {
      ws.receive({ type: "sync.provider_unavailable", reason: "ProviderNotRunnableError" });
    });

    await screen.findByText("AI is not configured");
    expect(
      screen.getByText("Add the provider's credential in Settings to enable triage."),
    ).toBeDefined();
    // The loader is gone, not merely covered — asserted on the body text, since a
    // failure here would otherwise print the whole toaster.
    await waitFor(() =>
      expect(document.body.textContent).not.toContain("AI is triaging your mails"),
    );
  });

  test("its action is the way to Settings", async () => {
    const ws = startSync();

    act(() => {
      ws.receive({ type: "sync.provider_unavailable" });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));

    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/settings"));
  });

  // The compatibility half. An API that has not been redeployed still sends the
  // pre-#127 name; dropping it would leave the triage toast spinning with no
  // explanation, which is exactly the failure the event was added to prevent.
  test("the previous release's name does the same thing", async () => {
    const ws = startSync();
    triageRunning(ws);
    await screen.findByText("AI is triaging your mails…");

    act(() => {
      ws.receive({ type: "sync.claude_unavailable", reason: "ClaudeTokenMissingError" });
    });

    await screen.findByText("AI is not configured");
    expect(
      screen.getByText("Add the provider's credential in Settings to enable triage."),
    ).toBeDefined();
    // The loader is gone, not merely covered — asserted on the body text, since a
    // failure here would otherwise print the whole toaster.
    await waitFor(() =>
      expect(document.body.textContent).not.toContain("AI is triaging your mails"),
    );
  });
});
