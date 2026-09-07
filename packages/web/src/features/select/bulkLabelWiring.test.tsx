import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listedMessage } from "../../api/listedMessage.fixture";
import type { Label, ListMessagesResponse } from "../../api/types";

// Applying a label to a selection, as a user does it (#147): in select mode the
// bulk bar offers the account's labels, picking one sends a single request for
// the whole selection, and the rows carry the label before the server answers.
//
// Rendered into the DOM harness (#129, #134) rather than matched against the
// component's source: what is worth asserting here is what a user sees and
// clicks — a spelling regex would break on a rename and pass on a picker wired
// to the wrong account's labels.

interface Sent {
  path: string;
  method?: string;
  body: Record<string, unknown>;
}

const sent: Sent[] = [];
let answer: () => void;
/** Resolved by `answer()`, so a test can read the lists while the request is
 * still in flight — which is where an optimistic write is the only thing that
 * could have put a label on a row. */
let answered: Promise<void>;

/**
 * The one seam stubbed: the api client, registered in the file body with the
 * subject imported after it, for the reason `gateSteps.test.tsx` gives — a bun
 * module mock is process-global, so a suite that registers none gets whichever
 * one ran last, and this suite is loaded after three that register theirs.
 * Anything the bar is not seeded for is refused, so a stray request fails the
 * test rather than resolving to a silent `{}`.
 */
mock.module("../../api/client", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: async (req: Sent) => {
    if (req.path !== "/messages/batch") throw new Error(`unexpected request: ${req.path}`);
    sent.push({ path: req.path, method: req.method, body: req.body });
    await answered;
    return { ok: true, action: "label", count: 1 };
  },
}));

const { BulkActionBar } = await import("./BulkActionBar");
const { queryKeys } = await import("../../api/queries");

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
// Gmail's own mailboxes are not labels to hand out in bulk: applying INBOX or
// SENT to a selection is not what "apply a label" means.
const INBOX = label({ id: "lab-inbox", name: "INBOX", type: "system" });
const THEIRS = label({ id: "lab-theirs", name: "Theirs", accountId: OTHER });

beforeEach(() => {
  sent.length = 0;
  answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
});

afterEach(async () => {
  // Let anything still in flight finish rather than leaving a pending mutation
  // to land in the next test's assertions.
  answer();
  await answered;
});

const listKey = ["messages", { accountId: ACCOUNT }];

const renderBar = (selectedIds: string[], labels: Label[] | null = [WORK, INBOX, INVOICES]) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // Left unseeded, the query goes to the stubbed client, which refuses it.
  if (labels) qc.setQueryData(queryKeys.labels(ACCOUNT), labels);
  qc.setQueryData(queryKeys.labels(OTHER), [THEIRS]);
  qc.setQueryData(listKey, {
    items: [
      listedMessage({ gmailMessageId: "msg-1", labels: [] }),
      listedMessage({ gmailMessageId: "msg-2", labels: [] }),
      listedMessage({ gmailMessageId: "msg-3", labels: [] }),
    ],
    nextCursor: null,
  } satisfies ListMessagesResponse);

  render(
    <QueryClientProvider client={qc}>
      <BulkActionBar
        accountId={ACCOUNT}
        selectedIds={selectedIds}
        totalCount={3}
        allSelected={false}
        onSelectAll={() => {}}
        onClear={() => {}}
        onExit={() => {}}
      />
    </QueryClientProvider>,
  );
  return {
    labelsOf: (gmailMessageId: string) =>
      qc
        .getQueryData<ListMessagesResponse>(listKey)
        ?.items.find((m) => m.gmailMessageId === gmailMessageId)
        ?.labels.map((l) => l.name),
  };
};

const trigger = () => screen.getByRole("button", { name: "Apply label" });
const picker = () => screen.queryByRole("menu", { name: "Labels" });
// A click is what a tap produces: the picker opens on it rather than on hover,
// so a finger reaches it as readily as a pointer.
const openPicker = () => fireEvent.click(trigger());

describe("the bulk bar's label picker", () => {
  test("offers this account's own labels, and nothing that is not one", () => {
    renderBar(["msg-1"]);

    expect(picker()).toBeNull();

    openPicker();

    const items = within(picker()!)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    // The other account's label and Gmail's own mailbox are both absent.
    expect(items).toEqual(["Invoices", "Work"]);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  test("picking a label sends one request for the whole selection", async () => {
    renderBar(["msg-1", "msg-3"]);
    openPicker();

    fireEvent.click(within(picker()!).getByRole("menuitem", { name: "Work" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      path: "/messages/batch",
      method: "POST",
      body: {
        accountId: ACCOUNT,
        gmailMessageIds: ["msg-1", "msg-3"],
        action: "label",
        labelId: "lab-work",
      },
    });
    // …and it closes behind the pick rather than staying open over the list.
    expect(picker()).toBeNull();
  });

  test("the selected rows carry the label before the server answers", async () => {
    const { labelsOf } = renderBar(["msg-1", "msg-3"]);
    openPicker();

    fireEvent.click(within(picker()!).getByRole("menuitem", { name: "Work" }));

    // The request is still in flight — the stub answers only in `afterEach` —
    // so what the lists read now is the optimistic write and nothing else.
    await waitFor(() => expect(labelsOf("msg-1")).toEqual(["Work"]));
    expect(sent).toHaveLength(1);
    expect(labelsOf("msg-3")).toEqual(["Work"]);
    expect(labelsOf("msg-2")).toEqual([]);
  });

  test("an empty selection has nothing to label, so it asks nothing", () => {
    renderBar([]);

    expect((trigger() as HTMLButtonElement).disabled).toBe(true);

    openPicker();

    expect(picker()).toBeNull();
    expect(sent).toEqual([]);
  });

  test("says so when the labels could not be read, rather than offering none", async () => {
    renderBar(["msg-1"], null);

    openPicker();

    await waitFor(() => expect(within(picker()!).getByText("Couldn't load labels.")).toBeDefined());
    expect(within(picker()!).queryAllByRole("menuitem")).toHaveLength(0);
    expect(sent).toEqual([]);
  });

  test("the four existing actions are still there beside it", () => {
    renderBar(["msg-1"]);

    for (const name of ["Mark as read", "Mark as unread", "Archive", "Delete"]) {
      expect(screen.getByRole("button", { name })).toBeDefined();
    }
  });
});
