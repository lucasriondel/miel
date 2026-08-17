import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  applyLabelSuggestionMutationOptions,
  archiveMessageMutationOptions,
  batchMessageActionMutationOptions,
  generateReplyMutationOptions,
  removeMessageLabelMutationOptions,
  sendReplyMutationOptions,
  setMessagePriorityMutationOptions,
  setMessageReadMutationOptions,
  suggestSimilarFilterMutationOptions,
} from "./mutations";
import { listedMessage } from "./listedMessage.fixture";
import type { ListMessagesResponse, ListedMessage, MessageLabel } from "./types";

// #131. Every message mutation now runs through `messageMutationOptions`, which
// owns the choreography and is tested in `messageMutation.test.ts`. What is left
// per mutation is what only it knows: the route it calls and how it expects a
// cached row to look afterwards. That is what this pins — at the options seam,
// which is where a mutation's contract lives; no component has to be rendered
// to read it.

// Stubs `fetch` rather than mocking `./client`, for the reason
// `filters.hooks.test.ts` gives: a module mock of the api client is
// process-global and bleeds into sibling suites, and the real client also
// proves the URL the route actually receives.
const originalFetch = globalThis.fetch;

interface Captured {
  url: string;
  method: string | undefined;
  body: unknown;
}

function stubFetch(body: unknown = { ok: true }): Captured[] {
  const calls: Captured[] = [];
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
  return calls;
}

const INPUT = { accountId: "acc-1", gmailMessageId: "msg-1" };
const listKey = ["messages", { accountId: "acc-1" }];

// `apiFetch` resolves the path-only base against the window's origin, and the
// origin is the DOM harness's (#129) rather than one this file builds — read
// here instead of written down so the URLs below stay the ones a browser sends.
const API = `${window.location.origin}/api`;

const UNREAD: MessageLabel = {
  id: "__unread__",
  name: "UNREAD",
  gmailLabelId: "UNREAD",
  colorBg: null,
  colorFg: null,
};

const list = (items: ListedMessage[]): ListMessagesResponse => ({ items, nextCursor: null });

function seed(items: ListedMessage[]): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(listKey, list(items));
  return qc;
}

const cached = (qc: QueryClient) => qc.getQueryData<ListMessagesResponse>(listKey)?.items ?? [];
const ids = (qc: QueryClient) => cached(qc).map((m) => m.gmailMessageId);
const labelNames = (qc: QueryClient, index = 0) => cached(qc)[index]?.labels.map((l) => l.name);

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("archiving a message", () => {
  test("POSTs the archive route", async () => {
    const calls = stubFetch({ ok: true, threadId: "th-1" });

    await archiveMessageMutationOptions(new QueryClient()).mutationFn(INPUT);

    expect(calls[0]?.url).toBe(`${API}/messages/acc-1/msg-1/archive`);
    expect(calls[0]?.method).toBe("POST");
  });

  // Gmail archives the whole thread and the backend marks every message in it,
  // so the siblings have to go too — otherwise they re-appear on the next
  // refetch, seconds after the row they were sitting under vanished.
  test("hides the whole thread, not just the message acted on", async () => {
    const qc = seed([
      listedMessage({ gmailMessageId: "msg-1", gmailThreadId: "th-1" }),
      listedMessage({ gmailMessageId: "msg-2", gmailThreadId: "th-1" }),
      listedMessage({ gmailMessageId: "msg-3", gmailThreadId: "th-2" }),
    ]);

    await archiveMessageMutationOptions(qc).onMutate(INPUT);

    expect(ids(qc)).toEqual(["msg-3"]);
  });

  test("leaves another account's thread of the same id alone", async () => {
    const qc = seed([
      listedMessage({ gmailMessageId: "msg-1", gmailThreadId: "th-1" }),
      listedMessage({ accountId: "acc-2", gmailMessageId: "msg-9", gmailThreadId: "th-1" }),
    ]);

    await archiveMessageMutationOptions(qc).onMutate(INPUT);

    expect(ids(qc)).toEqual(["msg-9"]);
  });

  test("does not refetch the lists on success — the removal is authoritative", () => {
    const qc = seed([listedMessage({})]);

    archiveMessageMutationOptions(qc).onSuccess({ ok: true, threadId: "th-1" }, INPUT);

    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false);
  });

  test("puts the thread back when the archive failed", async () => {
    const qc = seed([
      listedMessage({ gmailMessageId: "msg-1", gmailThreadId: "th-1" }),
      listedMessage({ gmailMessageId: "msg-2", gmailThreadId: "th-1" }),
    ]);
    const options = archiveMessageMutationOptions(qc);

    options.onError(new Error("boom"), INPUT, await options.onMutate(INPUT));

    expect(ids(qc)).toEqual(["msg-1", "msg-2"]);
  });
});

describe("marking a message read or unread", () => {
  test("POSTs the read flag", async () => {
    const calls = stubFetch({ ok: true, read: true });

    await setMessageReadMutationOptions(new QueryClient()).mutationFn({ ...INPUT, read: true });

    expect(calls[0]?.url).toBe(`${API}/messages/acc-1/msg-1/read`);
    expect(calls[0]?.body).toEqual({ read: true });
  });

  test("strips the UNREAD label when marking read", async () => {
    const qc = seed([listedMessage({ labels: [UNREAD] })]);

    await setMessageReadMutationOptions(qc).onMutate({ ...INPUT, read: true });

    expect(labelNames(qc)).toEqual([]);
  });

  test("adds the UNREAD label when marking unread", async () => {
    const qc = seed([listedMessage({ labels: [] })]);

    await setMessageReadMutationOptions(qc).onMutate({ ...INPUT, read: false });

    expect(labelNames(qc)).toEqual(["UNREAD"]);
  });

  test("does not add a second UNREAD to a message that already has one", async () => {
    const qc = seed([listedMessage({ labels: [UNREAD] })]);

    await setMessageReadMutationOptions(qc).onMutate({ ...INPUT, read: false });

    expect(labelNames(qc)).toEqual(["UNREAD"]);
  });

  test("rolls the label back when the request failed", async () => {
    const qc = seed([listedMessage({ labels: [UNREAD] })]);
    const options = setMessageReadMutationOptions(qc);

    options.onError(
      new Error("boom"),
      { ...INPUT, read: true },
      await options.onMutate({ ...INPUT, read: true }),
    );

    expect(labelNames(qc)).toEqual(["UNREAD"]);
  });
});

describe("acting on a selection of messages", () => {
  test("POSTs the batch route with the ids and the action", async () => {
    const calls = stubFetch({ ok: true, action: "trash", count: 2 });

    await batchMessageActionMutationOptions(new QueryClient()).mutationFn({
      accountId: "acc-1",
      gmailMessageIds: ["msg-1", "msg-2"],
      action: "trash",
    });

    expect(calls[0]?.url).toBe(`${API}/messages/batch`);
    expect(calls[0]?.body).toEqual({
      accountId: "acc-1",
      gmailMessageIds: ["msg-1", "msg-2"],
      action: "trash",
    });
  });

  test("removes every selected row for a trash or archive", async () => {
    const qc = seed([
      listedMessage({ gmailMessageId: "msg-1" }),
      listedMessage({ gmailMessageId: "msg-2" }),
      listedMessage({ gmailMessageId: "msg-3" }),
    ]);

    await batchMessageActionMutationOptions(qc).onMutate({
      accountId: "acc-1",
      gmailMessageIds: ["msg-1", "msg-3"],
      action: "archive",
    });

    expect(ids(qc)).toEqual(["msg-2"]);
  });

  test("marks every selected row read without removing any", async () => {
    const qc = seed([
      listedMessage({ gmailMessageId: "msg-1", labels: [UNREAD] }),
      listedMessage({ gmailMessageId: "msg-2", labels: [UNREAD] }),
    ]);

    await batchMessageActionMutationOptions(qc).onMutate({
      accountId: "acc-1",
      gmailMessageIds: ["msg-1"],
      action: "read",
    });

    expect(ids(qc)).toEqual(["msg-1", "msg-2"]);
    expect(labelNames(qc, 0)).toEqual([]);
    expect(labelNames(qc, 1)).toEqual(["UNREAD"]);
  });

  test("marks every selected row unread", async () => {
    const qc = seed([listedMessage({ gmailMessageId: "msg-1", labels: [] })]);

    await batchMessageActionMutationOptions(qc).onMutate({
      accountId: "acc-1",
      gmailMessageIds: ["msg-1"],
      action: "unread",
    });

    expect(labelNames(qc)).toEqual(["UNREAD"]);
  });

  test("re-reads each selected message when the batch failed", async () => {
    const qc = seed([listedMessage({ gmailMessageId: "msg-1" })]);
    qc.setQueryData(["message", "acc-1", "msg-1"], {});
    qc.setQueryData(["message", "acc-1", "msg-2"], {});

    batchMessageActionMutationOptions(qc).onError(
      new Error("boom"),
      { accountId: "acc-1", gmailMessageIds: ["msg-1", "msg-2"], action: "trash" },
      undefined,
    );

    expect(qc.getQueryState(["message", "acc-1", "msg-1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["message", "acc-1", "msg-2"])?.isInvalidated).toBe(true);
  });
});

describe("accepting a label suggestion", () => {
  const EXISTING = {
    ...INPUT,
    triageId: "tr-1",
    kind: "existing" as const,
    labelId: "lab-1",
    name: "Invoices",
    colorBg: null,
    colorFg: null,
  };
  const NEW = { ...INPUT, triageId: "tr-1", kind: "new" as const, suggestionId: "sug-1" };

  test("accepts an existing label by id", async () => {
    const calls = stubFetch({ ok: true });

    await applyLabelSuggestionMutationOptions(new QueryClient()).mutationFn(EXISTING);

    expect(calls[0]?.url).toBe(`${API}/messages/acc-1/msg-1/apply-suggestions`);
    expect(calls[0]?.body).toEqual({
      triageId: "tr-1",
      acceptExistingLabelIds: ["lab-1"],
    });
  });

  test("accepts a new label by suggestion id", async () => {
    const calls = stubFetch({ ok: true });

    await applyLabelSuggestionMutationOptions(new QueryClient()).mutationFn(NEW);

    expect(calls[0]?.body).toEqual({ triageId: "tr-1", acceptNewSuggestionIds: ["sug-1"] });
  });

  test("attaches the label and clears the suggestion it came from", async () => {
    const qc = seed([
      listedMessage({
        pendingSuggestions: {
          existing: [{ labelId: "lab-1", name: "Invoices", colorBg: null, colorFg: null }],
          new: [],
        },
      }),
    ]);

    await applyLabelSuggestionMutationOptions(qc).onMutate(EXISTING);

    expect(labelNames(qc)).toEqual(["Invoices"]);
    expect(cached(qc)[0]?.pendingSuggestions.existing).toEqual([]);
  });

  test("does not attach a label the message already carries", async () => {
    const qc = seed([
      listedMessage({
        labels: [
          { id: "lab-1", name: "Invoices", gmailLabelId: "lab-1", colorBg: null, colorFg: null },
        ],
      }),
    ]);

    await applyLabelSuggestionMutationOptions(qc).onMutate(EXISTING);

    expect(labelNames(qc)).toEqual(["Invoices"]);
  });

  // A new label is created server-side, so nothing can be attached optimistically
  // — only the suggestion that produced it goes away.
  test("clears a new-label suggestion without inventing the label", async () => {
    const qc = seed([
      listedMessage({
        pendingSuggestions: { existing: [], new: [{ suggestionId: "sug-1", name: "Receipts" }] },
      }),
    ]);

    await applyLabelSuggestionMutationOptions(qc).onMutate(NEW);

    expect(cached(qc)[0]?.pendingSuggestions.new).toEqual([]);
    expect(labelNames(qc)).toEqual([]);
  });

  // Accepting a new suggestion creates a Gmail label, so the account's label
  // list is stale as well as the message.
  test("re-reads the account's labels afterwards", () => {
    const qc = seed([listedMessage({})]);
    qc.setQueryData(["accounts", "acc-1", "labels"], []);

    applyLabelSuggestionMutationOptions(qc).onSuccess(
      { ok: true, appliedExistingLabelIds: [], createdLabels: [], attached: [] },
      NEW,
    );

    expect(qc.getQueryState(["accounts", "acc-1", "labels"])?.isInvalidated).toBe(true);
  });
});

describe("removing a label from a message", () => {
  const input = { ...INPUT, labelId: "lab-1" };

  test("POSTs the label as a removal", async () => {
    const calls = stubFetch({ ok: true, added: [], removed: [] });

    await removeMessageLabelMutationOptions(new QueryClient()).mutationFn(input);

    expect(calls[0]?.url).toBe(`${API}/messages/acc-1/msg-1/labels`);
    expect(calls[0]?.body).toEqual({ remove: ["lab-1"] });
  });

  test("drops the label from the cached row", async () => {
    const qc = seed([
      listedMessage({
        labels: [
          { id: "lab-1", name: "Invoices", gmailLabelId: "lab-1", colorBg: null, colorFg: null },
          { id: "lab-2", name: "Receipts", gmailLabelId: "lab-2", colorBg: null, colorFg: null },
        ],
      }),
    ]);

    await removeMessageLabelMutationOptions(qc).onMutate(input);

    expect(labelNames(qc)).toEqual(["Receipts"]);
  });
});

describe("changing a message's priority", () => {
  const input = { ...INPUT, priority: "high" as const };

  test("POSTs the new priority", async () => {
    const calls = stubFetch({ ok: true });

    await setMessagePriorityMutationOptions(new QueryClient()).mutationFn(input);

    expect(calls[0]?.url).toBe(`${API}/messages/acc-1/msg-1/priority`);
    expect(calls[0]?.body).toEqual({ priority: "high" });
  });

  test("re-buckets the row before the server answers", async () => {
    const qc = seed([listedMessage({ priority: "low" })]);

    await setMessagePriorityMutationOptions(qc).onMutate(input);

    expect(cached(qc)[0]?.priority).toBe("high");
  });

  test("puts the old priority back when the request failed", async () => {
    const qc = seed([listedMessage({ priority: "low" })]);
    const options = setMessagePriorityMutationOptions(qc);

    options.onError(new Error("boom"), input, await options.onMutate(input));

    expect(cached(qc)[0]?.priority).toBe("low");
  });
});

describe("replying", () => {
  test("asks for a draft without touching the cache", async () => {
    const calls = stubFetch({ subject: "Re: hi", body: "…", model: "m", runId: "r" });

    await generateReplyMutationOptions().mutationFn({ ...INPUT, prompt: "be brief" });

    expect(calls[0]?.url).toBe(`${API}/messages/acc-1/msg-1/generate-reply`);
    expect(calls[0]?.body).toEqual({ prompt: "be brief" });
  });

  test("sends the reply and re-reads the thread it now belongs to", async () => {
    const calls = stubFetch({ ok: true, sentMessageId: "sent-1" });
    const qc = seed([listedMessage({})]);
    qc.setQueryData(["message", "acc-1", "msg-1"], {});
    const options = sendReplyMutationOptions(qc);
    const input = { ...INPUT, subject: "Re: hi", body: "sure" };

    await options.mutationFn(input);
    options.onSuccess({ ok: true, sentMessageId: "sent-1" }, input);

    expect(calls[0]?.url).toBe(`${API}/messages/acc-1/msg-1/send-reply`);
    expect(calls[0]?.body).toEqual({ subject: "Re: hi", body: "sure" });
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["message", "acc-1", "msg-1"])?.isInvalidated).toBe(true);
  });
});

describe("suggesting a filter from a message", () => {
  test("posts an empty body when the user gave no prompt", async () => {
    const calls = stubFetch({ suggestions: [] });

    await suggestSimilarFilterMutationOptions(new QueryClient()).mutationFn(INPUT);

    expect(calls[0]?.url).toBe(`${API}/messages/acc-1/msg-1/filter-suggest`);
    expect(calls[0]?.body).toEqual({});
  });

  test("passes the prompt along when there is one", async () => {
    const calls = stubFetch({ suggestions: [] });

    await suggestSimilarFilterMutationOptions(new QueryClient()).mutationFn({
      ...INPUT,
      prompt: "everything from this sender",
    });

    expect(calls[0]?.body).toEqual({ prompt: "everything from this sender" });
  });

  // The suggestion lands in the filters list and nowhere else: the message it
  // was derived from is unchanged, so neither the lists nor the detail are
  // re-read.
  test("re-reads the filters and leaves the message lists alone", () => {
    const qc = seed([listedMessage({})]);
    qc.setQueryData(["filters", "acc-1"], { filters: [] });

    suggestSimilarFilterMutationOptions(qc).onSuccess();

    expect(qc.getQueryState(["filters", "acc-1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false);
  });
});
