// The row's suggestion trigger (req. 6) and the end cell that cannot shift (req. 9).
//
// Every label Claude suggested used to sit inline as one badge each, which is
// what made the subject start at a different x on every row. They collapse to a
// single trigger now — a `+` disc leading the label group — and the deciding
// happens in a popover with room to say what each label is: apply one, dismiss
// the set, or apply the set.
//
// Rendered, and taken through the real `apiFetch` so the request each button
// makes is asserted at the wire rather than at a mock's arguments.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listedMessage } from "../api/listedMessage.fixture";
import type { ListedMessage } from "../api/types";
import { MessageRow } from "./MessageRow";

interface Request {
  url: string;
  body: unknown;
}

const originalFetch = globalThis.fetch;
let requests: Request[] = [];

beforeEach(() => {
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body ?? "null")) });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const withSuggestions = (over: Partial<ListedMessage> = {}): ListedMessage =>
  listedMessage({
    accountId: "acc-1",
    gmailMessageId: "msg-1",
    subject: "Votre réclamation",
    triageId: "11111111-1111-4111-8111-111111111111",
    pendingSuggestions: {
      existing: [
        {
          labelId: "22222222-2222-4222-8222-222222222222",
          name: "Keep/Orders",
          colorBg: null,
          colorFg: null,
        },
      ],
      new: [
        {
          suggestionId: "33333333-3333-4333-8333-333333333333",
          name: "Refunds",
        },
      ],
    },
    ...over,
  });

const mount = (message: ListedMessage) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/account/acc-1"]}>
        <MessageRow message={message} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const openPill = () => {
  fireEvent.click(screen.getByRole("button", { name: "Show 2 suggested labels" }));
};

describe("the row's suggestion trigger", () => {
  test("says only that there is something, naming nothing on the row", () => {
    const view = mount(withSuggestions());

    const trigger = screen.getByRole("button", { name: "Show 2 suggested labels" });
    expect(trigger).toBeTruthy();
    // The names belong in the popover, where there is room for them.
    expect(screen.queryByText("Keep/Orders")).toBeNull();
    // So does the count. The glyph is the whole face, so the trigger is the
    // same width whether Claude said one thing or four — which is what lets it
    // sit in the label group without moving the subject. The number survives
    // where it is read rather than seen, in the accessible name above.
    expect(trigger.textContent).toBe("");
    expect(view.container.querySelector(".suggestion-edge")).toBeTruthy();
  });

  test("leads the label group rather than trailing it", () => {
    // Trailing would park it at a different x on every row — one label, three,
    // none — which is the complaint that moved it off the row's end.
    const view = mount(
      withSuggestions({
        labels: [
          { id: "lbl-1", name: "Work", gmailLabelId: "Label_1", colorBg: null, colorFg: null },
        ],
      }),
    );

    // The group is whatever holds both; the trigger has to be its first child.
    const group = view.container.querySelector(".suggestion-edge")?.closest("span.flex");
    expect(group?.textContent).toContain("Work");
    expect(group?.firstElementChild?.querySelector(".suggestion-edge")).toBeTruthy();
  });

  test("keeps no gap on a row with nothing suggested", () => {
    // The old trigger sat in a slot reserved on every row so that whether
    // Claude had an opinion could not move the date. A constant-width trigger
    // buys that without the width: nothing suggested renders nothing at all.
    const view = mount(
      withSuggestions({ pendingSuggestions: { existing: [], new: [] }, labels: [] }),
    );

    expect(view.container.querySelector(".suggestion-edge")).toBeNull();
    expect(view.container.querySelector(".suggestion-face")).toBeNull();
    // Not even an empty group: `MessageRowLabels` is handed a prop rather than
    // an element that renders nothing, so a row with neither labels nor a
    // suggestion draws no flex child at all. One left behind would spend the
    // row's `gap-2` in front of the subject, which is the gap this trigger
    // exists not to keep.
    expect(view.container.querySelector("span.flex.shrink-0.items-center.gap-1")).toBeNull();
  });

  test("is absent when Claude had no opinion", () => {
    mount(withSuggestions({ pendingSuggestions: { existing: [], new: [] } }));

    expect(screen.queryByRole("button", { name: /suggested label/ })).toBeNull();
  });

  test("is absent when there is no triage to act on", () => {
    // The routes take that run's ids, so there is nothing to send.
    mount(withSuggestions({ triageId: null }));

    expect(screen.queryByRole("button", { name: /suggested label/ })).toBeNull();
  });

  test("names each label in the popover, saying which would have to be created", () => {
    mount(withSuggestions());
    openPill();

    expect(screen.getByText("Keep/Orders")).toBeTruthy();
    expect(screen.getByText("Refunds")).toBeTruthy();
    expect(screen.getByText("Existing")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
  });
});

describe("acting on the suggestions", () => {
  test("applies one on its own", async () => {
    mount(withSuggestions());
    openPill();

    fireEvent.click(screen.getByRole("button", { name: 'Apply suggested label "Keep/Orders"' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.url).toContain("/messages/acc-1/msg-1/apply-suggestions");
    expect(requests[0]!.body).toMatchObject({
      acceptExistingLabelIds: ["22222222-2222-4222-8222-222222222222"],
    });
  });

  test("applies the whole set in one request", async () => {
    mount(withSuggestions());
    openPill();

    fireEvent.click(screen.getByRole("button", { name: "Apply all" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.url).toContain("/messages/acc-1/msg-1/apply-suggestions");
    // One call, not a loop: the pill empties once rather than counting down.
    expect(requests[0]!.body).toMatchObject({
      acceptExistingLabelIds: ["22222222-2222-4222-8222-222222222222"],
      acceptNewSuggestionIds: ["33333333-3333-4333-8333-333333333333"],
    });
  });

  test("dismisses the whole set, naming only the triage", async () => {
    mount(withSuggestions());
    openPill();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss all" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.url).toContain("/messages/acc-1/msg-1/dismiss-suggestions");
    // Declining touches nothing in Gmail, so the request carries no label ids.
    expect(requests[0]!.body).toEqual({ triageId: "11111111-1111-4111-8111-111111111111" });
  });
});

describe("the row's end cell (req. 9)", () => {
  test("puts the date and the actions in one grid cell, so revealing shifts nothing", () => {
    const view = mount(withSuggestions());

    // Both are mounted at once and stacked — `col-start-1 row-start-1` on each —
    // so the hover is a cross-fade rather than one replacing the other. An
    // earlier draft hid the date with `display:none`, which reflowed the line
    // under the pointer.
    const stacked = view.container.querySelectorAll(".col-start-1.row-start-1");
    expect(stacked.length).toBe(2);
  });

  test("keeps the actions mounted at rest rather than adding them on hover", () => {
    // Mounting on hover would change the cell's width the moment the pointer
    // arrived, which is the shift the reserved cell exists to prevent.
    mount(withSuggestions());

    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
  });
});
