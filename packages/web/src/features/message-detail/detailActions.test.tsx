// Acting on the message you are looking at (#145).
//
// The optimistic machinery was already there, and the detail page got none of
// it: the `["messages"]` lists were written before the answer came back, the
// `["message", …]` query behind the open page was merely invalidated, and the
// two ways off the page waited for the round trip before moving. So a label
// removed sat there until a refetch landed, and a delete left the user on a
// dead page for the length of the request.
//
// Rendered into the DOM harness (#129), because both halves are about what is
// on screen and when. The cache shapes each mutation writes — and the URL each
// one really sends, through the real client — are pinned at the options seam
// next door (`api/mutations.messages.test.ts`); what is here is the page: the
// badge that goes, the chip that changes, the inbox that arrives before the
// server has said anything, and the failure that follows the user off the page
// they have already left.
//
// It is also where `components/MessageActions.test.ts` went. That suite matched
// `/onSuccess:\s*returnToInbox/` over the component's source — the exact line
// this change had to move — and its other two assertions are the sweep in
// `features/inbox/detailExits.test.ts` and the last test below, both of which
// say more than a regex over a spelling could.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MessageDetail, MessageLabel } from "../../api/types";

/**
 * The api client is the seam, stubbed in the file body with the subjects
 * imported after it, for the reason `gateSteps.test.tsx` gives: a module mock
 * is process-global, so a suite that registers none gets whichever one ran
 * last.
 *
 * Every request it takes stays in flight until a test settles it — "before the
 * server answers" is the whole subject here, so nothing resolves on its own.
 */
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
  succeed: (result: unknown) => void;
  refuse: (error: unknown) => void;
}

let inFlight: InFlight[] = [];

mock.module("../../api/client", () => ({
  ApiError,
  apiFetch: (req: { path: string; method?: string }) =>
    new Promise((resolve, reject) => {
      inFlight.push({
        path: req.path,
        method: req.method ?? "GET",
        succeed: resolve,
        refuse: reject,
      });
    }),
}));

const { MessageActions } = await import("../../components/MessageActions");
const { MessageDetailPage } = await import("../../pages/MessageDetailPage");
const { MielToaster } = await import("../../components/MielToaster");
const { queryKeys } = await import("../../api/queries");
const { messageDetail, triageRun } = await import("../../api/messageDetail.fixture");

/** What the click asked the server for, and has not been told about yet. */
const sent = () => inFlight.map((call) => `${call.method} ${call.path}`);

const settle = async (answer: (call: InFlight) => void) => {
  const call = inFlight.shift();
  if (!call) throw new Error("nothing was in flight");
  await act(async () => {
    answer(call);
    await Promise.resolve();
  });
};

const succeed = () => settle((call) => call.succeed({ ok: true }));
const refuse = () =>
  settle((call) =>
    call.refuse(
      new ApiError("gmail_failed", 500, {
        error: "gmail_failed",
        message: "Gmail refused the change",
      }),
    ),
  );

const INVOICES: MessageLabel = {
  id: "lab-1",
  name: "Invoices",
  gmailLabelId: "lab-1",
  colorBg: null,
  colorFg: null,
};

// The detail page reads nothing off the layout — the top bar is the layout's
// own now, and its controls arrive through `PageTopBar`, which renders them in
// place when no bar is mounted above. An empty context keeps that true: a page
// that started destructuring one would throw here rather than get a stub.
const LAYOUT = {};

const renderPage = (message: MessageDetail = messageDetail()) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(queryKeys.message(message.accountId, message.gmailMessageId), message);
  return render(
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

const button = (name: string) => screen.getByRole("button", { name });
const maybeButton = (name: string) => screen.queryByRole("button", { name });
const atTheInbox = () => screen.queryByText("Back at the inbox") !== null;

beforeEach(() => {
  inFlight = [];
});

afterEach(() => {
  // A request nobody settled would otherwise hold a mutation open into the next
  // test, whose assertions are about a page that has just been mounted.
  inFlight = [];
});

describe("what the page shows before the server answers", () => {
  // Toggled the other way round since #142: opening an unread message marks it
  // read on its own, so by the time this page is on screen there is no "Mark as
  // read" left to click. That direction is `markReadOnOpen.test.tsx`; what is
  // still the toggle's own is the trip back, and the flip is the same one.
  test("marking unread flips the toggle, and a refusal flips it back", async () => {
    renderPage(messageDetail());

    fireEvent.click(button("Mark as unread"));

    await waitFor(() => expect(maybeButton("Mark as read")).not.toBeNull());
    expect(sent()).toEqual(["POST /messages/acc-1/msg-1/read"]);

    await refuse();

    await waitFor(() => expect(maybeButton("Mark as unread")).not.toBeNull());
  });

  test("removing a label drops the badge, and a refusal puts it back", async () => {
    renderPage(messageDetail({ labels: [INVOICES] }));

    fireEvent.click(button("Remove label Invoices"));

    await waitFor(() => expect(maybeButton("Remove label Invoices")).toBeNull());
    expect(sent()).toEqual(["POST /messages/acc-1/msg-1/labels"]);

    await refuse();

    await waitFor(() => expect(maybeButton("Remove label Invoices")).not.toBeNull());
  });

  test("accepting a suggestion turns the pill into the label it proposed", async () => {
    renderPage(
      messageDetail({
        latestTriageId: "tr-1",
        triageHistory: [
          triageRun({
            id: "tr-1",
            existingLabelSuggestions: [
              {
                labelId: "lab-1",
                name: "Invoices",
                colorBg: null,
                colorFg: null,
                status: "pending",
              },
            ],
          }),
        ],
      }),
    );

    fireEvent.click(button("Invoices"));

    await waitFor(() => expect(maybeButton("Remove label Invoices")).not.toBeNull());
    expect(maybeButton("Invoices")).toBeNull();
    expect(sent()).toEqual(["POST /messages/acc-1/msg-1/apply-suggestions"]);

    await refuse();

    // The pill comes back and the label goes: a suggestion the server refused
    // was never accepted.
    await waitFor(() => expect(maybeButton("Invoices")).not.toBeNull());
    expect(maybeButton("Remove label Invoices")).toBeNull();
  });

  test("changing the priority re-reads the triage chip", async () => {
    renderPage(
      messageDetail({
        latestTriageId: "tr-1",
        triageHistory: [triageRun({ id: "tr-1", priority: "low" })],
      }),
    );
    expect(screen.getByText("low")).toBeDefined();

    fireEvent.click(button("Change priority"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "high" }));

    await waitFor(() => expect(screen.queryByText("high")).not.toBeNull());
    expect(screen.queryByText("low")).toBeNull();
    expect(sent()).toEqual(["POST /messages/acc-1/msg-1/priority"]);

    await refuse();

    await waitFor(() => expect(screen.queryByText("low")).not.toBeNull());
  });
});

/**
 * A message carrying a verification code, so the confirmation panel — and its
 * "Handled this confirmation?" delete, the third way off the page — is rendered.
 */
const WITH_CODE = messageDetail({
  subject: "Your verification code",
  bodyText: "Your verification code is 123456.",
});

describe("leaving the page", () => {
  test("archiving returns to the inbox without waiting for the answer", async () => {
    renderPage();

    fireEvent.click(button("Archive"));

    await waitFor(() => expect(atTheInbox()).toBe(true));
    // Still unanswered: leaving is not something the round trip is asked about.
    expect(sent()).toEqual(["POST /messages/acc-1/msg-1/archive"]);
  });

  test("deleting does the same", async () => {
    renderPage();

    fireEvent.click(button("Delete"));

    await waitFor(() => expect(atTheInbox()).toBe(true));
    expect(sent()).toEqual(["DELETE /messages/acc-1/msg-1"]);
  });

  test("so does the confirmation panel's delete", async () => {
    renderPage(WITH_CODE);
    expect(screen.getByText("123456")).toBeDefined();

    fireEvent.click(button("Delete message"));

    await waitFor(() => expect(atTheInbox()).toBe(true));
    expect(sent()).toEqual(["DELETE /messages/acc-1/msg-1"]);
  });

  test("a refused archive is reported on the page the user has moved to", async () => {
    renderPage();

    fireEvent.click(button("Archive"));
    await waitFor(() => expect(atTheInbox()).toBe(true));

    await refuse();

    // react-query drops the callbacks passed to `mutate` once their component
    // has unmounted, and this one always has — so the notice hangs off the
    // mutation itself, and reaches a user who is already somewhere else.
    await waitFor(() =>
      expect(
        screen.queryByText("Could not archive message: Gmail refused the change"),
      ).not.toBeNull(),
    );
    expect(atTheInbox()).toBe(true);
  });

  test("a refused delete says so too", async () => {
    renderPage();

    fireEvent.click(button("Delete"));
    await waitFor(() => expect(atTheInbox()).toBe(true));

    await refuse();

    await waitFor(() =>
      expect(
        screen.queryByText("Could not delete message: Gmail refused the change"),
      ).not.toBeNull(),
    );
  });

  test("nothing is said when the request lands", async () => {
    renderPage();

    fireEvent.click(button("Archive"));
    await waitFor(() => expect(atTheInbox()).toBe(true));

    await succeed();

    expect(document.body.textContent).not.toContain("Could not archive");
  });

  // The same component is the inbox row's actions, where leaving would mean
  // leaving the inbox: the row is already gone from the list, and the page it
  // was on is where the user still is.
  test("the same action from an inbox row leaves the user where they are", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <MemoryRouter initialEntries={["/account/acc-1"]}>
          <Routes>
            <Route path="account/:accountId" element={<p>Back at the inbox</p>} />
            <Route path="account/:accountId/messages/:id" element={<p>the message</p>} />
          </Routes>
          <MessageActions
            accountId="acc-1"
            accountEmail="a@example.com"
            gmailMessageId="msg-1"
            isUnread={false}
            isArchived={false}
            isTrashed={false}
            priority={null}
            variant="row"
          />
        </MemoryRouter>
        <MielToaster />
      </QueryClientProvider>,
    );

    fireEvent.click(button("Archive"));

    await waitFor(() => expect(sent()).toEqual(["POST /messages/acc-1/msg-1/archive"]));
    expect(atTheInbox()).toBe(true);

    await refuse();

    // The notice reaches a caller still on screen too — once. It lives on the
    // mutation for the sake of the ones that have gone, which is exactly what
    // makes a second one, passed to `mutate` by a caller that stays, a repeat.
    await waitFor(() =>
      expect(
        screen.queryAllByText("Could not archive message: Gmail refused the change"),
      ).toHaveLength(1),
    );
  });
});
