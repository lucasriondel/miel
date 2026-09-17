// Labelling a message from its row in the inbox (#170), as a user does it: no
// opening the message, no entering select mode — a trigger in the row's own
// action strip, the shared picker, and the badge on the row before the server
// answers.
//
// The page is mounted for real, for the reason `categorySelectWiring.test.tsx`
// gives: the row's trigger, the one picker the list mounts and the mutation are
// three parts that have to agree, and a test of any one of them alone would pass
// with the row wired to a picker of its own — which is the thing this issue
// forbids and which no source regex could tell apart.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LayoutContext } from "../../App";
import { listedMessage } from "../../api/listedMessage.fixture";
import type { Label, ListedMessage, MessageLabel } from "../../api/types";

// The real client, put back before the subjects load: `fetch` is this suite's
// seam — so the URL and body the endpoint receives are proven too — and a bun
// module mock is process-global, outliving the file that registered one.
const realClient = await import("../../api/client.ts?real");
mock.module("../../api/client", () => ({ ...realClient }));

const { queryKeys } = await import("../../api/queries");
const { InboxPage } = await import("../../pages/InboxPage");
const { MielToaster } = await import("../../components/MielToaster");
const { TriageActivityProvider } = await import("../../contexts/TriageActivityContext");
const { MessageRowActions } = await import("../../components/MessageRowActions");
const { RowLabelPickerHost } = await import("./RowLabelPickerHost");

const ACCOUNT = "acc-1";
const OTHER = "acc-2";
const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2026-09-01T00:00:00.000Z");

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
// Gmail's own mailboxes are not labels to hand out: putting INBOX on a message
// is not what "add a label" means.
const INBOX = label({ id: "lab-inbox", name: "INBOX", type: "system" });

const LUNCH = "Lunch with Dana";
const QUOTE = "Your quote for the roof";

const MAILBOX: ListedMessage[] = [
  listedMessage({
    accountId: ACCOUNT,
    gmailMessageId: "msg-lunch",
    subject: LUNCH,
    priority: "high",
  }),
  listedMessage({
    accountId: ACCOUNT,
    gmailMessageId: "msg-quote",
    subject: QUOTE,
    priority: "low",
  }),
];

interface Sent {
  url: string;
  method: string;
  body: unknown;
}

const originalFetch = globalThis.fetch;
let urls: string[] = [];
let sent: Sent[] = [];
let mailbox: ListedMessage[] = MAILBOX;
/** Held open so a test can read the lists while the POST is still in flight —
 *  which is where an optimistic badge is the only thing that could have drawn
 *  itself. Settled by `succeed()` / `refuse()`. */
let answerLabelCall: (answer: { ok: boolean }) => void;
let labelAnswer: Promise<{ ok: boolean }>;

/** A turn of the event loop with React's queue flushed — the answer has landed
 *  and the cache has been written by the time this returns. */
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const CATALOGUE = [WORK, INBOX, INVOICES];

/** The catalogue label as a message carries it. */
const asMessageLabel = (l: Label): MessageLabel => ({
  id: l.id,
  name: l.name,
  gmailLabelId: l.gmailLabelId,
  colorBg: l.colorBg,
  colorFg: l.colorFg,
});

/** Which message the POST named, and the label it attached. */
const acceptedLabelCall = (url: string, body: BodyInit | null | undefined) => {
  const id = new URL(url, "https://miel.test").pathname.split("/").at(-2)!;
  const [labelId] = (JSON.parse(String(body)) as { add: string[] }).add;
  return { id, added: asMessageLabel(CATALOGUE.find((l) => l.id === labelId)!) };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  urls = [];
  sent = [];
  mailbox = MAILBOX;
  labelAnswer = new Promise((resolve) => {
    answerLabelCall = resolve;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/labels") && init?.method === "POST") {
      sent.push({
        url,
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const answer = await labelAnswer;
      if (!answer.ok) {
        return json({ error: "gmail_failed", message: "Gmail refused the change" }, 500);
      }
      // A server that agreed says so on the next read of the list, so the
      // re-read a success triggers does not undo what it just accepted.
      const { id, added } = acceptedLabelCall(url, init.body);
      mailbox = mailbox.map((m) =>
        m.gmailMessageId === id ? { ...m, labels: [...m.labels, added] } : m,
      );
      return json({ ok: true, added: [added], removed: [] });
    }
    if (url.includes(`/accounts/${OTHER}/labels`)) return json({ labels: [] });
    if (url.includes("/labels")) return json({ labels: CATALOGUE });
    if (url.includes("/promo-codes")) return json({ items: [] });
    if (url.includes("/filters")) return json({ filters: [], suggestions: [] });
    if (url.includes("/messages")) return json({ items: mailbox, nextCursor: null });
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;
});

afterEach(async () => {
  // Let anything still in flight land while the stub is still the one
  // answering, rather than leaving a re-read to reach the network.
  answerLabelCall?.({ ok: true });
  await settle();
  globalThis.fetch = originalFetch;
});

const layout = (): LayoutContext => ({
  selectedAccountId: ACCOUNT,
  selectedLabelId: undefined,
  rangeStartIso: RANGE_START.toISOString(),
  rangeEndIso: RANGE_END.toISOString(),
  range: { start: RANGE_START, end: RANGE_END, key: "2026-08-01", mode: "month" },
  isCurrentPeriod: true,
  canGoNext: false,
  goPrev: () => {},
  goNext: () => {},
  goToday: () => {},
  setViewMode: () => {},
  selectedAccountEmail: undefined,
});

const mountInbox = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(
    queryKeys.messages({
      accountId: ACCOUNT,
      labelId: undefined,
      internalDateFrom: RANGE_START.toISOString(),
      internalDateTo: RANGE_END.toISOString(),
    }),
    { pages: [{ items: mailbox, nextCursor: null }], pageParams: [undefined] },
  );
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/account/${ACCOUNT}`]}>
        <TriageActivityProvider>
          <Routes>
            <Route element={<Outlet context={layout()} />}>
              <Route path="/account/:accountId" element={<InboxPage />} />
            </Route>
          </Routes>
        </TriageActivityProvider>
      </MemoryRouter>
      <MielToaster />
    </QueryClientProvider>,
  );
};

const rowOf = (subject: string): HTMLElement => {
  const row = screen.getByText(subject).closest(".message-row");
  if (!row) throw new Error(`no row showing "${subject}"`);
  return row as HTMLElement;
};
const triggerOn = (subject: string) =>
  within(rowOf(subject)).getByRole("button", { name: "Add label" });
const openOn = (subject: string) => fireEvent.click(triggerOn(subject));
const pickers = () => screen.queryAllByRole("menu", { name: "Labels" });
const picker = () => pickers()[0];
const items = () =>
  within(picker()!)
    .queryAllByRole("menuitem")
    .map((item) => item.textContent);
const pick = (name: string | RegExp) =>
  fireEvent.click(within(picker()!).getByRole("menuitem", { name }));
const badgesOn = (subject: string) =>
  within(rowOf(subject))
    .queryAllByTitle(/^(Work|Invoices)$/)
    .map((el) => el.textContent);
const labelReads = () => urls.filter((u) => u.includes(`/accounts/${ACCOUNT}/labels`));

/** The list re-reads the server on a success, so a settled row is one whose
 *  re-read has landed too. */
const listReads = () => urls.filter((u) => u.includes("/messages?"));
const succeed = async () => {
  answerLabelCall({ ok: true });
  await waitFor(() => expect(listReads().length).toBeGreaterThan(0));
  await settle();
};
const refuse = async () => {
  answerLabelCall({ ok: false });
  await settle();
};

describe("the row's add-label trigger", () => {
  test("every row offers one, and no picker is mounted until one is pressed", () => {
    mountInbox();

    expect(triggerOn(LUNCH)).toBeDefined();
    expect(triggerOn(QUOTE)).toBeDefined();
    // Fifty rows must not build fifty popovers: the list mounts one panel, and
    // only once a row asks for it.
    expect(pickers()).toHaveLength(0);
  });

  test("pressing one opens a single picker, offering this account's own labels", async () => {
    mountInbox();

    openOn(LUNCH);

    await waitFor(() => expect(pickers()).toHaveLength(1));
    // Gmail's own mailbox is not among them, and the list is the picker's rule.
    expect(items()).toEqual(["Invoices", "Work"]);
    expect(triggerOn(LUNCH).getAttribute("aria-expanded")).toBe("true");
    expect(triggerOn(QUOTE).getAttribute("aria-expanded")).toBe("false");
    // The strip is revealed by hover and focus, and the panel is portalled out
    // of the row so it has neither: the row says it is being labelled, which is
    // what keeps its actions up under the panel hanging off them.
    expect(rowOf(LUNCH).getAttribute("data-labelling")).toBe("true");
    expect(rowOf(QUOTE).getAttribute("data-labelling")).toBeNull();
  });

  test("moving to another row leaves one picker, and reads the labels once for the list", async () => {
    mountInbox();

    openOn(LUNCH);
    await waitFor(() => expect(pickers()).toHaveLength(1));
    openOn(QUOTE);

    await waitFor(() => expect(triggerOn(QUOTE).getAttribute("aria-expanded")).toBe("true"));
    expect(pickers()).toHaveLength(1);
    expect(triggerOn(LUNCH).getAttribute("aria-expanded")).toBe("false");
    // One read for the list, not one per row that was asked.
    expect(labelReads()).toHaveLength(1);
  });

  test("pressing the same row's trigger again closes it", async () => {
    mountInbox();

    openOn(LUNCH);
    await waitFor(() => expect(pickers()).toHaveLength(1));
    openOn(LUNCH);

    expect(pickers()).toHaveLength(0);
  });
});

describe("attaching a label from the row", () => {
  test("sends it as an addition and draws the badge before the server answers", async () => {
    mountInbox();
    openOn(LUNCH);
    await waitFor(() => expect(pickers()).toHaveLength(1));

    pick("Work");

    await waitFor(() => expect(badgesOn(LUNCH)).toEqual(["Work"]));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toContain("/messages/acc-1/msg-lunch/labels");
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.body).toEqual({ add: ["lab-work"] });
    // The row that was not labelled is untouched, and the panel closes behind
    // the pick rather than sitting over the list.
    expect(badgesOn(QUOTE)).toEqual([]);
    expect(pickers()).toHaveLength(0);
  });

  test("takes the badge back off and says why when the server refuses", async () => {
    mountInbox();
    openOn(LUNCH);
    await waitFor(() => expect(pickers()).toHaveLength(1));
    pick("Work");
    await waitFor(() => expect(badgesOn(LUNCH)).toEqual(["Work"]));

    await refuse();

    await waitFor(() => expect(badgesOn(LUNCH)).toEqual([]));
    // A rollback on its own is silent: a badge that appears and quietly goes
    // again reads as a click that missed.
    await waitFor(() =>
      expect(screen.queryByText("Could not add label: Gmail refused the change")).not.toBeNull(),
    );
  });

  test("a label the row already carries is marked rather than hidden, and asks nothing", async () => {
    // Hidden rather than shown, a label already on the message reads as one
    // this account does not have.
    mailbox = [{ ...MAILBOX[0]!, labels: [asMessageLabel(INVOICES)] }, MAILBOX[1]!];
    mountInbox();
    openOn(LUNCH);
    await waitFor(() => expect(pickers()).toHaveLength(1));

    pick(/Invoices/);

    expect(items()).toEqual(["InvoicesAdded", "Work"]);
    expect(sent).toEqual([]);
  });

  test("the row's badges stay read-only — attaching is the row's, detaching is the page's", async () => {
    mountInbox();
    openOn(LUNCH);
    await waitFor(() => expect(pickers()).toHaveLength(1));
    pick("Work");
    await waitFor(() => expect(badgesOn(LUNCH)).toEqual(["Work"]));

    await succeed();

    // The server agreed and the re-read says so, and the badge it left is still
    // only a badge: taking one off is a decision, and the detail page is where
    // that is made.
    expect(badgesOn(LUNCH)).toEqual(["Work"]);
    expect(within(rowOf(LUNCH)).queryByRole("button", { name: /Remove label/ })).toBeNull();
  });
});

// The mobile row draws its actions in the swipe-revealed strip rather than the
// end cell's hover overlay, and both mount the same `MessageActions` — so the
// trigger is there by construction. Asserted rather than assumed, because it is
// the layout where "open the message instead" costs the most.
describe("the same trigger on the mobile row", () => {
  const mountStrip = () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    qc.setQueryData(queryKeys.labels(ACCOUNT), CATALOGUE);
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/account/${ACCOUNT}`]}>
          <RowLabelPickerHost>
            <MessageRowActions
              accountId={ACCOUNT}
              accountEmail="me@example.com"
              gmailMessageId="msg-lunch"
              appliedLabelIds={[]}
              isUnread={false}
              isArchived={false}
              isTrashed={false}
              priority={null}
              isMobile
              revealed
              onClose={() => {}}
            />
          </RowLabelPickerHost>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  test("is in the swipe-revealed strip, and opens the list's one picker", async () => {
    mountStrip();

    fireEvent.click(screen.getByRole("button", { name: "Add label" }));

    await waitFor(() => expect(pickers()).toHaveLength(1));
    expect(items()).toEqual(["Invoices", "Work"]);
  });
});
