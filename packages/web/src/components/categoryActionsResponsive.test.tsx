// Acting on a whole Gmail category from a phone.
//
// The band heading's actions — "Select all", "Mark all as read", "Archive all"
// and "Delete all in <band>" — were a hover-revealed cell marked `hidden` below
// `sm`. On a touch device they were therefore unreachable: the only way to
// delete a whole category was a pointer. They are now swiped for, the way a
// message row's actions already are.
//
// Rendered rather than read as source, the repo's standard. The viewport is set
// to a phone's, the heading is swiped with real touch events, and what is
// asserted is what a reader can then find and press — plus the request the
// press produces, so the strip is proved wired to the band it sits on rather
// than merely present.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listedMessage } from "../api/listedMessage.fixture";
import type { ListedMessage } from "../api/types";
import { TriageActivityProvider } from "../contexts/TriageActivityContext";
import { PrioritySection } from "./PrioritySection";

interface Request {
  url: string;
  method: string;
  body: unknown;
}

const originalFetch = globalThis.fetch;
/** happy-dom's own default, restored after each test — the viewport is global. */
const DESKTOP_WIDTH = 1024;
const PHONE_WIDTH = 390;

const viewport = (width: number) =>
  (
    window as unknown as { happyDOM: { setViewport: (v: { width: number }) => void } }
  ).happyDOM.setViewport({ width });

let requests: Request[] = [];

beforeEach(() => {
  localStorage.clear();
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    // Only the batch endpoint is expected; anything else is a query that has
    // escaped the cache and should fail loudly rather than answer `{}`.
    if (!url.endsWith("/messages/batch")) throw new Error(`unexpected request: ${url}`);
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: JSON.parse(String(init?.body ?? "null")),
    });
    return new Response(JSON.stringify({ ok: true, action: "trash", count: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.clear();
  viewport(DESKTOP_WIDTH);
});

const label = (name: string) => ({
  id: name,
  gmailLabelId: name,
  name,
  colorBg: null,
  colorFg: null,
});

const promo = (id: string): ListedMessage =>
  listedMessage({
    accountId: "acc-1",
    gmailMessageId: id,
    fromName: `sender ${id}`,
    subject: `subject ${id}`,
    priority: "high",
    labels: [label("CATEGORY_PROMOTIONS")],
  });

const mount = (onToggleCategory?: (accountId: string, ids: string[]) => void) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/account/acc-1"]}>
        <TriageActivityProvider>
          <PrioritySection
            accountId="acc-1"
            priority="high"
            messages={[promo("m-1"), promo("m-2")]}
            onToggleCategory={onToggleCategory}
          />
        </TriageActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** The band heading — the surface the gesture is made on. */
const heading = (): HTMLElement =>
  screen
    .getByRole("button", { name: /Promotions/ })
    .closest(".category-group-header") as HTMLElement;

const swipeLeft = (el: HTMLElement) => {
  fireEvent.touchStart(el, { touches: [{ clientX: 320, clientY: 40 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: 200, clientY: 44 }] });
  fireEvent.touchEnd(el, {});
};

const tap = (el: HTMLElement) => {
  fireEvent.touchStart(el, { touches: [{ clientX: 120, clientY: 40 }] });
  fireEvent.touchEnd(el, {});
  fireEvent.click(el);
};

describe("a category band's actions below `sm`", () => {
  test("are not mounted until the heading is swiped", () => {
    viewport(PHONE_WIDTH);
    mount();

    expect(screen.queryByRole("button", { name: "Delete all in Promotions" })).toBeNull();

    swipeLeft(heading());

    expect(screen.getByRole("button", { name: "Delete all in Promotions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive all in Promotions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark all as read in Promotions" })).toBeTruthy();
  });

  test("delete the band they sit on, and nothing else", async () => {
    viewport(PHONE_WIDTH);
    mount();
    swipeLeft(heading());

    fireEvent.click(screen.getByRole("button", { name: "Delete all in Promotions" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.body).toEqual({
      accountId: "acc-1",
      gmailMessageIds: ["m-1", "m-2"],
      action: "trash",
    });
  });

  test("carry the category select too, so a band can be selected without a pointer", () => {
    viewport(PHONE_WIDTH);
    const selected: string[][] = [];
    mount((_accountId, ids) => selected.push(ids));
    swipeLeft(heading());

    fireEvent.click(screen.getByRole("button", { name: "Select all promotions messages" }));

    expect(selected).toEqual([["m-1", "m-2"]]);
  });

  test("the swipe does not also collapse the band it reveals on", () => {
    viewport(PHONE_WIDTH);
    mount();
    const head = heading();

    swipeLeft(head);
    // The click a browser synthesizes on the element the finger left. The
    // heading *is* its own collapse toggle, so without the guard every reveal
    // would shut the band underneath it.
    fireEvent.click(screen.getByRole("button", { name: "Collapse Promotions" }));

    expect(screen.getByRole("button", { name: "Collapse Promotions" })).toBeTruthy();
    expect(screen.getByText("subject m-1")).toBeTruthy();
  });

  test("a plain tap still collapses it", () => {
    viewport(PHONE_WIDTH);
    mount();

    tap(screen.getByRole("button", { name: "Collapse Promotions" }));

    expect(screen.getByRole("button", { name: "Expand Promotions" })).toBeTruthy();
  });

  test("a tap anywhere else puts the strip away", async () => {
    viewport(PHONE_WIDTH);
    mount();
    swipeLeft(heading());
    expect(screen.getByRole("button", { name: "Delete all in Promotions" })).toBeTruthy();

    // The listeners are bound on a deferred tick so the gesture's own pointer
    // event cannot close what it just opened — so the tick has to pass first.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("button", { name: "Delete all in Promotions" })).toBeNull();
  });
});

describe("the same actions at `sm` and above", () => {
  test("stay the hover-revealed cell, mounted with no gesture at all", () => {
    viewport(DESKTOP_WIDTH);
    mount();

    const button = screen.getByRole("button", { name: "Delete all in Promotions" });
    expect(button.closest(".category-group-actions")).toBeTruthy();
  });
});
