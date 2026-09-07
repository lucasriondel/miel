// One Sync button, and it fetches the period the inbox is showing (#152).
//
// Rendered rather than read: the promise this issue makes is that what the
// pager displays and what the socket asks Gmail for are the same period, and
// the only honest way to assert that is to put the URL the pager writes in
// front of the button and read the frame that leaves. The transport is the one
// seam — everything above it (the range built from the URL, the window derived
// from it, the account) is the real thing.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SyncActions } from "../../components/topbar/SyncActions";
import { TriageActivityProvider } from "../../contexts/TriageActivityContext";
import { useDateRange } from "./useDateRange";

const ACCOUNT = "user@example.com";

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
  }

  /** The browser's own handshake: the payload is sent once the socket opens. */
  open() {
    for (const fn of this.listeners.get("open") ?? []) fn({});
  }
}

const originalWebSocket = globalThis.WebSocket;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  FakeSocket.instances = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    throw new Error(`unexpected request: ${String(input)}`);
  }) as typeof fetch;
  localStorage.clear();
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  globalThis.fetch = originalFetch;
  localStorage.clear();
});

/** The inbox's own wiring: the range comes off the URL, as it does on the page. */
const Harness = ({ accountEmail }: { accountEmail: string | undefined }) => {
  const { range } = useDateRange();
  return <SyncActions accountEmail={accountEmail} range={range} />;
};

const mount = (
  entry: string,
  props: { accountEmail: string | undefined } = { accountEmail: ACCOUNT },
) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <TriageActivityProvider>
          <Harness {...props} />
        </TriageActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const syncButton = () => screen.getByRole<HTMLButtonElement>("button", { name: /^Sync / });

/** The one period noun a sighted user reads; the others are there to size it. */
const periodNouns = () =>
  [...syncButton().querySelectorAll("span")].filter((el) =>
    ["week", "month", "year"].includes(el.textContent ?? ""),
  );

const shownNoun = () =>
  periodNouns().find((el) => !el.classList.contains("invisible"))?.textContent;

const hiddenNouns = () =>
  periodNouns()
    .filter((el) => el.classList.contains("invisible"))
    .map((el) => el.textContent);

/** Press Sync and read the frame the socket was handed. */
function pressSync(): Record<string, unknown> {
  fireEvent.click(syncButton());
  const ws = FakeSocket.instances.at(-1);
  if (!ws) throw new Error("the press opened no socket");
  ws.open();
  const frame = ws.sent.at(-1);
  if (!frame) throw new Error("the socket was handed nothing");
  return JSON.parse(frame) as Record<string, unknown>;
}

const today = new Date();
/**
 * The exclusive end of today. Gmail's `before:` is exclusive, so a window that
 * includes today names tomorrow — which is also as far as a sync may ever ask.
 */
const TOMORROW = (() => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
})();
const THIS_YEAR = today.getFullYear();

describe("Sync fetches the period on screen", () => {
  test("a past week", () => {
    // Mon Jun 15 2026 → the window runs to Mon Jun 22, exclusive.
    mount("/?range=2026-06-17");
    expect(pressSync()).toEqual({
      type: "sync.start",
      account: ACCOUNT,
      range: { from: "2026-06-15", to: "2026-06-22" },
    });
  });

  test("a past month", () => {
    mount("/?view=month&range=2026-03-14");
    expect(pressSync()).toEqual({
      type: "sync.start",
      account: ACCOUNT,
      range: { from: "2026-03-01", to: "2026-04-01" },
    });
  });

  test("a past year", () => {
    mount("/?view=year&range=2024-06-17");
    expect(pressSync()).toEqual({
      type: "sync.start",
      account: ACCOUNT,
      range: { from: "2024-01-01", to: "2025-01-01" },
    });
  });

  test("the current year stops at today, not at December 31st", () => {
    mount("/?view=year");
    expect(pressSync()).toEqual({
      type: "sync.start",
      account: ACCOUNT,
      range: { from: `${THIS_YEAR}-01-01`, to: TOMORROW },
    });
  });

  test("the current week stops at today too", () => {
    mount("/");
    const frame = pressSync() as { range: { from: string; to: string } };
    expect(frame.range.to).toBe(TOMORROW);
  });

  test("no preset token rides along", () => {
    mount("/?view=month&range=2026-03-14");
    expect(pressSync()).not.toHaveProperty("since");
  });

  // The sync period used to be a setting of its own, kept in localStorage. It is
  // not consulted any more, and a browser that still holds one must not fetch a
  // different period from the one it is showing.
  test("a stored sync period from before #152 changes nothing", () => {
    localStorage.setItem("miel.sync.period", JSON.stringify({ kind: "preset", since: "90d" }));
    mount("/?view=month&range=2026-03-14");
    expect(pressSync()).toEqual({
      type: "sync.start",
      account: ACCOUNT,
      range: { from: "2026-03-01", to: "2026-04-01" },
    });
  });
});

describe("the button says what it will fetch", () => {
  test("its accessible name is the period the pager shows", () => {
    mount("/?range=2026-06-17");
    expect(syncButton().getAttribute("aria-label")).toBe("Sync Jun 15 – Jun 21, 2026");
  });

  test("a month and a year name themselves", () => {
    mount("/?view=month&range=2026-03-14");
    expect(syncButton().getAttribute("aria-label")).toBe("Sync March 2026");
  });

  test("its visible label is the bare period noun", () => {
    mount("/?view=year&range=2024-06-17");
    expect(shownNoun()).toBe("year");
    // The dates stay in the accessible name, where width is not the constraint.
    expect(syncButton().getAttribute("aria-label")).toBe("Sync 2024");
  });

  test("a week says week, not its dates", () => {
    mount("/?range=2026-06-17");
    expect(shownNoun()).toBe("week");
    expect(syncButton().textContent).not.toContain("Jun");
  });

  test("a month says month, not its dates", () => {
    mount("/?view=month&range=2026-03-14");
    expect(shownNoun()).toBe("month");
    expect(syncButton().textContent).not.toContain("Mar");
  });

  // All three nouns are in the DOM so the widest can size the button, which is
  // why these read the visible one rather than the button's text: "contains
  // week" would pass on every period.
  test("the other two nouns are present but hidden, sizing the button", () => {
    mount("/?range=2026-06-17");
    expect(hiddenNouns()).toEqual(["month", "year"]);
  });

  test("no period picker is left to open", () => {
    mount("/?range=2026-06-17");
    expect(screen.queryByRole("button", { name: "Choose sync period" })).toBeNull();
  });
});

describe("what disables it", () => {
  test("no account selected", () => {
    mount("/?range=2026-06-17", { accountEmail: undefined });
    expect(syncButton().disabled).toBe(true);
  });

  test("a run in flight", () => {
    mount("/?range=2026-06-17");
    pressSync();
    expect(syncButton().disabled).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Triage messages" }).disabled,
    ).toBe(true);
  });
});
