// Labelling the message you are looking at (#167).
//
// The last gap in the set: a label could be taken off one message (the ✕ on its
// badge), put on many at once (the bulk bar, in select mode) or accepted from a
// suggestion — so a message with no triage run, or one whose suggestions were
// all settled, could not be labelled at all without going back to the list.
//
// Rendered rather than read as source, for the reason the suites beside it give:
// what is worth asserting is what a user sees and clicks. Two of these tests are
// specifically about a message that has *nothing* — no label, no suggestion — and
// a regex over the header's source could not tell that case from any other.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Label, MessageDetail, MessageLabel } from "../../api/types";

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

interface InFlight {
  path: string;
  method: string;
  body: unknown;
  succeed: (result: unknown) => void;
  refuse: (error: unknown) => void;
}

let inFlight: InFlight[] = [];

/**
 * The api client, stubbed in the file body with the subjects imported after it —
 * a bun module mock is process-global, so a suite that registers none gets
 * whichever one ran last. Nothing resolves on its own: "before the server
 * answers" is where an optimistic badge is the only thing that could have drawn
 * itself.
 */
mock.module("../../api/client", () => ({
  ApiError,
  apiFetch: (req: { path: string; method?: string; body?: unknown }) =>
    new Promise((resolve, reject) => {
      inFlight.push({
        path: req.path,
        method: req.method ?? "GET",
        body: req.body,
        succeed: resolve,
        refuse: reject,
      });
    }),
}));

const { MessageDetailPage } = await import("../../pages/MessageDetailPage");
const { MielToaster } = await import("../../components/MielToaster");
const { queryKeys } = await import("../../api/queries");
const { messageDetail, triageRun } = await import("../../api/messageDetail.fixture");

const settle = async (answer: (call: InFlight) => void) => {
  const call = inFlight.shift();
  if (!call) throw new Error("nothing was in flight");
  await act(async () => {
    answer(call);
    await Promise.resolve();
  });
};

const refuse = () =>
  settle((call) =>
    call.refuse(
      new ApiError("gmail_failed", 500, {
        error: "gmail_failed",
        message: "Gmail refused the change",
      }),
    ),
  );

const ACCOUNT = "acc-1";
const OTHER = "acc-2";

const label = (over: Partial<Label> & { id: string; name: string }): Label => ({
  accountId: ACCOUNT,
  gmailLabelId: `Label_${over.id}`,
  type: "user",
  colorBg: null,
  colorFg: null,
  ...over,
});

const WORK = label({ id: "lab-work", name: "Work" });
const INVOICES = label({ id: "lab-invoices", name: "Invoices" });
// Gmail's own mailboxes are not labels to hand out: putting INBOX or SENT on a
// message is not what "add a label" means.
const SENT = label({ id: "lab-sent", name: "SENT", type: "system" });
const THEIRS = label({ id: "lab-theirs", name: "Theirs", accountId: OTHER });

const asMessageLabel = (l: Label): MessageLabel => ({
  id: l.id,
  name: l.name,
  gmailLabelId: l.gmailLabelId,
  colorBg: l.colorBg,
  colorFg: l.colorFg,
});

const LAYOUT = {};

const renderPage = (
  message: MessageDetail = messageDetail(),
  labels: Label[] | null = [WORK, SENT, INVOICES],
) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(queryKeys.message(message.accountId, message.gmailMessageId), message);
  // Left unseeded, the labels query goes to the stubbed client and stays in
  // flight — which is how the "couldn't load" state is reached below.
  if (labels) qc.setQueryData(queryKeys.labels(ACCOUNT), labels);
  qc.setQueryData(queryKeys.labels(OTHER), [THEIRS]);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[`/account/${message.accountId}/messages/${message.gmailMessageId}`]}
      >
        <Routes>
          <Route path="/" element={<Outlet context={LAYOUT} />}>
            <Route path="account/:accountId" element={<p>Back at the inbox</p>} />
            <Route
              path="account/:accountId/messages/:gmailMessageId"
              element={<MessageDetailPage />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
      <MielToaster />
    </QueryClientProvider>,
  );
};

const trigger = () => screen.getByRole("button", { name: "Add label" });
const picker = () => screen.queryByRole("menu", { name: "Labels" });
const openPicker = () => fireEvent.click(trigger());
const pick = (name: string | RegExp) =>
  fireEvent.click(within(picker()!).getByRole("menuitem", { name }));
const filterField = () => screen.queryByLabelText("Filter labels") as HTMLInputElement | null;
const type = (value: string) => fireEvent.change(filterField()!, { target: { value } });
const items = () =>
  within(picker()!)
    .queryAllByRole("menuitem")
    .map((item) => item.textContent);

/** The requests this page sent to the message's own label route, and no other. */
const labelCalls = () => inFlight.filter((call) => call.path === "/messages/acc-1/msg-1/labels");

beforeEach(() => {
  inFlight = [];
});

afterEach(() => {
  inFlight = [];
});

describe("the add-label trigger", () => {
  // The header draws its badge row only when there is a badge in it, so the
  // message that most wants labelling — no labels, no suggestions — had no label
  // area whatsoever. The trigger has to survive that.
  test("is on a message with no labels and no suggestions", () => {
    renderPage(messageDetail({ labels: [], triageHistory: [] }));

    expect(trigger()).toBeDefined();
  });

  test("is there just the same beside labels and suggestions", () => {
    renderPage(
      messageDetail({
        labels: [asMessageLabel(INVOICES)],
        latestTriageId: "tr-1",
        triageHistory: [
          triageRun({
            id: "tr-1",
            existingLabelSuggestions: [
              {
                labelId: WORK.id,
                name: WORK.name,
                colorBg: null,
                colorFg: null,
                status: "pending",
              },
            ],
          }),
        ],
      }),
    );

    expect(trigger()).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove label Invoices" })).toBeDefined();
  });

  test("opens on a click, and offers this account's own labels and nothing else", () => {
    renderPage();

    expect(picker()).toBeNull();

    openPicker();

    // The other account's label and Gmail's own mailbox are both absent.
    expect(items()).toEqual(["Invoices", "Work"]);
  });
});

describe("attaching one", () => {
  test("sends the label as an addition and draws the badge before the server answers", async () => {
    renderPage();
    openPicker();

    pick("Work");

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove label Work" })).not.toBeNull(),
    );
    expect(labelCalls()).toHaveLength(1);
    expect(labelCalls()[0]?.path).toBe("/messages/acc-1/msg-1/labels");
    expect(labelCalls()[0]?.method).toBe("POST");
    expect(labelCalls()[0]?.body).toEqual({ add: ["lab-work"] });
    // …and the picker closes behind the pick rather than sitting over the page.
    expect(picker()).toBeNull();
  });

  test("takes the badge back off and says why when the server refuses", async () => {
    renderPage();
    openPicker();
    pick("Work");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove label Work" })).not.toBeNull(),
    );

    await refuse();

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove label Work" })).toBeNull(),
    );
    // A rollback on its own is silent: a badge that appears and quietly goes
    // again reads as a click that missed.
    await waitFor(() =>
      expect(screen.queryByText("Could not add label: Gmail refused the change")).not.toBeNull(),
    );
  });

  // Hidden rather than shown, a label already on the message reads as one this
  // account does not have; shown as applied it says what it is, and picking it
  // must still be incapable of producing a second badge.
  test("shows a label the message already carries as applied, and asks nothing for it", () => {
    renderPage(messageDetail({ labels: [asMessageLabel(INVOICES)] }));
    openPicker();

    pick(/Invoices/);

    expect(labelCalls()).toEqual([]);
    expect(screen.getAllByRole("button", { name: "Remove label Invoices" })).toHaveLength(1);
  });

  test("says so when the labels could not be read, rather than offering none", async () => {
    renderPage(messageDetail(), null);

    openPicker();
    // The read is the only thing in flight — the page's own message is seeded.
    await refuse();

    await waitFor(() => expect(within(picker()!).getByText("Couldn't load labels.")).toBeDefined());
    expect(within(picker()!).queryAllByRole("menuitem")).toHaveLength(0);
  });

  test("says it is still reading them while the request is in flight", () => {
    renderPage(messageDetail(), null);

    openPicker();

    // A list on its way is not a list that failed and not an account with no
    // labels: the three states stay three (#167), filter field or no.
    expect(within(picker()!).getByText("Loading labels…")).toBeDefined();
    expect(filterField()).toBeNull();
  });
});

// The shared picker's filter (#169), driven through the detail page's trigger —
// the other half of `select/bulkLabelWiring.test.tsx`'s. One component, so what
// narrows the bulk bar's list narrows this one.
describe("filtering the picker", () => {
  test("typing narrows the list and clearing restores it", () => {
    renderPage();
    openPicker();

    type("inv");

    expect(items()).toEqual(["Invoices"]);

    type("");

    expect(items()).toEqual(["Invoices", "Work"]);
  });

  test("the field takes the caret when the picker opens, so typing narrows it", () => {
    renderPage();

    openPicker();

    expect(document.activeElement).toBe(filterField());
  });

  test("a label reached through the filter is added like any other", async () => {
    renderPage();
    openPicker();

    type("wor");
    pick("Work");

    await waitFor(() => expect(labelCalls()).toHaveLength(1));
    expect(labelCalls()[0]?.body).toEqual({ add: ["lab-work"] });
    expect(picker()).toBeNull();
  });

  test("a label already on the message is still marked, filtered down to it", () => {
    renderPage(messageDetail({ labels: [asMessageLabel(INVOICES)] }));
    openPicker();

    type("inv");

    expect(items()).toEqual(["InvoicesAdded"]);
  });

  test("Escape still closes the popover from inside the field", () => {
    renderPage();
    openPicker();
    type("inv");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(picker()).toBeNull();
  });
});
