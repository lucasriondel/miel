// Opening a message marks it as read (#142).
//
// `UNREAD` is a Gmail label and nothing but an explicit click ever cleared it,
// so reading a message left it bold in the inbox — which is not what a mail
// client does. Opening one now clears the label through the same
// `useSetMessageRead` mutation the toggle uses, so the row behind the page
// unbolds optimistically and a refusal puts it back.
//
// Rendered into the DOM harness (#129) because all of it is about what happens
// on screen and when: no click anywhere in this file fires the mutation under
// test, and the three things to get right — once per message, nothing for a
// message already read, and a quiet failure — are only observable from the
// page. The cache shapes the mutation writes are pinned at the options seam
// (`api/mutations.messages.test.ts`).
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ListMessagesResponse, MessageDetail, MessageLabel } from "../../api/types";

/**
 * The api client is the seam, stubbed in the file body with the subjects
 * imported after it, for the reason `gateSteps.test.tsx` gives: a module mock is
 * process-global, so a suite that registers none gets whichever one ran last.
 *
 * Nothing resolves on its own — "before the server has answered" is where every
 * assertion here lives.
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
  body: unknown;
  succeed: (result: unknown) => void;
  refuse: (error: unknown) => void;
}

let inFlight: InFlight[] = [];

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
const { MessageRow } = await import("../../components/MessageRow");
const { MielToaster } = await import("../../components/MielToaster");
const { queryKeys, useMessages } = await import("../../api/queries");
const { messageDetail } = await import("../../api/messageDetail.fixture");
const { listedMessage } = await import("../../api/listedMessage.fixture");

/** Every request the page has made, whether or not it has been answered. */
const sent = () => inFlight.map((call) => `${call.method} ${call.path}`);

/** The read POSTs only — an invalidated list refetch is not this suite's subject. */
const reads = () => inFlight.filter((call) => call.path.endsWith("/read"));

const refuseAll = async () => {
  const calls = inFlight.filter((call) => call.path.endsWith("/read"));
  inFlight = inFlight.filter((call) => !calls.includes(call));
  await act(async () => {
    for (const call of calls) {
      call.refuse(
        new ApiError("gmail_failed", 500, {
          error: "gmail_failed",
          message: "Gmail refused the change",
        }),
      );
    }
    await Promise.resolve();
  });
};

/** Let mounting effects and the mutation they fire settle. */
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const UNREAD: MessageLabel = {
  id: "__unread__",
  name: "UNREAD",
  gmailLabelId: "UNREAD",
  colorBg: null,
  colorFg: null,
};

// The detail page reads nothing off the layout — the top bar is the layout's
// own now, and its controls arrive through `PageTopBar`, which renders them in
// place when no bar is mounted above. An empty context keeps that true: a page
// that started destructuring one would throw here rather than get a stub.
const LAYOUT = {};

const unreadMessage = (over: Partial<MessageDetail> = {}) =>
  messageDetail({ labels: [UNREAD], ...over });

const newClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });

/**
 * The page, at the first message given, with every message given seeded into
 * the detail cache. The link is what a second message is opened by: react-router
 * keeps the same page mounted across a param change, which is the case a
 * fire-once guard has to survive.
 */
const renderPage = (messages: MessageDetail[], qc: QueryClient = newClient()) => {
  for (const message of messages) {
    qc.setQueryData(queryKeys.message(message.accountId, message.gmailMessageId), message);
  }
  const first = messages[0]!;
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[`/account/${first.accountId}/messages/${first.gmailMessageId}`]}
      >
        <Routes>
          <Route
            path="/"
            element={
              <>
                <Link to="/account/acc-1/messages/msg-2">Open the next message</Link>
                <Outlet context={LAYOUT} />
              </>
            }
          >
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
  return qc;
};

beforeEach(() => {
  inFlight = [];
});

afterEach(() => {
  inFlight = [];
});

describe("opening a message", () => {
  test("marks an unread one read, with no click anywhere", async () => {
    renderPage([unreadMessage()]);

    await waitFor(() => expect(sent()).toEqual(["POST /messages/acc-1/msg-1/read"]));
    expect(inFlight[0]?.body).toEqual({ read: true });
    // The page it fired from says so before the server has answered.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Mark as unread" })).not.toBeNull(),
    );
  });

  test("asks for nothing when the message is already read", async () => {
    renderPage([messageDetail()]);

    await flush();

    expect(sent()).toEqual([]);
  });

  test("fires once, however often the query resolves again", async () => {
    const qc = renderPage([unreadMessage()]);
    await waitFor(() => expect(reads()).toHaveLength(1));

    // A refetch landing while the request is still in flight still reports the
    // message as unread — Gmail has not been told yet. It must not re-fire.
    await act(async () => {
      qc.setQueryData(queryKeys.message("acc-1", "msg-1"), unreadMessage());
      await Promise.resolve();
    });
    await flush();

    expect(reads()).toHaveLength(1);
  });

  // The decision belongs to the open, not to every sighting of the label:
  // clearing an UNREAD the reader has just asked for would make the top bar's
  // toggle unusable while the message is on screen.
  test("leaves an open message the reader marks unread alone", async () => {
    renderPage([messageDetail()]);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "Mark as unread" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Mark as read" })).not.toBeNull(),
    );
    await flush();
    expect(reads()).toHaveLength(1);
    expect(inFlight[0]?.body).toEqual({ read: false });
  });

  test("marks each of two messages read in turn", async () => {
    renderPage([unreadMessage(), unreadMessage({ gmailMessageId: "msg-2" })]);
    await waitFor(() => expect(reads()).toHaveLength(1));

    fireEvent.click(screen.getByRole("link", { name: "Open the next message" }));

    await waitFor(() =>
      expect(reads().map((call) => call.path)).toEqual([
        "/messages/acc-1/msg-1/read",
        "/messages/acc-1/msg-2/read",
      ]),
    );
  });
});

describe("the inbox row behind the page", () => {
  /** The row as the inbox renders it, off the same cache the mutation writes. */
  const InboxRowBehind = () => {
    const { data } = useMessages({ accountId: "acc-1" });
    const item = data?.items[0];
    return item ? <MessageRow message={item} /> : null;
  };

  const renderRowBehind = (qc: QueryClient) => {
    qc.setQueryData<ListMessagesResponse>(queryKeys.messages({ accountId: "acc-1" }), {
      items: [listedMessage({ subject: "Lunch", labels: [UNREAD] })],
      nextCursor: null,
    });
    const view = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/account/acc-1"]}>
          <InboxRowBehind />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // happy-dom loads no stylesheet, so weight has no computed value here; the
    // class the row bolds with is the only thing a render can be asked.
    return () => within(view.container).getByText("Lunch").className.includes("font-bold");
  };

  test("is no longer bold once the message is open", async () => {
    const qc = newClient();
    const isBold = renderRowBehind(qc);
    expect(isBold()).toBe(true);

    renderPage([unreadMessage()], qc);

    await waitFor(() => expect(isBold()).toBe(false));
  });

  test("comes back bold if the request is refused, and nothing is said about it", async () => {
    const qc = newClient();
    const isBold = renderRowBehind(qc);
    renderPage([unreadMessage()], qc);
    await waitFor(() => expect(isBold()).toBe(false));

    await refuseAll();

    await waitFor(() => expect(isBold()).toBe(true));
    // Nobody asked for this, so nobody is interrupted when it fails: the toggle
    // says unread again and that is the whole report.
    expect(document.body.textContent).not.toContain("Gmail refused the change");
    expect(document.body.textContent).not.toContain("Could not");
    await waitFor(() =>
      expect(screen.queryAllByRole("button", { name: "Mark as read" }).length).toBeGreaterThan(0),
    );
  });
});
