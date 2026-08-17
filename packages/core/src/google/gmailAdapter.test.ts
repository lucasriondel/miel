import { describe, test, expect, mock, afterAll } from "bun:test";

// Restore the process-global ./contracts + ./runtime mocks after this suite so
// they don't leak into other tests.
afterAll(() => mock.restore());

// gmailAdapter.sendReply must fetch the original message first to learn its
// threadId + Message-ID header, then send the reply with those so it threads
// correctly. We mock the Effect layer entirely: `./contracts` accessors return
// marker objects describing the call, and `./runtime`'s runWithApp interprets
// them — so we can assert exactly what `send` received.

interface Marker {
  op: string;
  args: unknown[];
}

let sendCapture: Record<string, unknown> | null = null;
const deleteFilterCalls: unknown[][] = [];
const ORIGINAL = {
  id: "orig-1",
  threadId: "thread-9",
  payload: {
    headers: [
      { name: "Message-ID", value: "<abc@mail.gmail.com>" },
      { name: "Subject", value: "Hi" },
    ],
  },
};

mock.module("./contracts", () => ({
  GmailMessages: {
    get: (...args: unknown[]) => ({ op: "get", args }) as Marker,
    send: (...args: unknown[]) => ({ op: "send", args }) as Marker,
    search: (...args: unknown[]) => ({ op: "search", args }) as Marker,
  },
  GmailLabels: { list: () => ({}), create: () => ({}) },
  GmailFilters: {
    list: () => ({}),
    create: () => ({}),
    delete: (...args: unknown[]) => ({ op: "filters.delete", args }) as Marker,
  },
  GmailThreads: { trash: () => ({}), archive: () => ({}) },
  GmailModify: { batch: () => ({}) },
  refKey: (r: { email?: string }) => `email:${r.email}`,
}));

mock.module("./runtime", () => ({
  runWithApp: async (marker: Marker) => {
    if (marker.op === "get") return ORIGINAL;
    if (marker.op === "send") {
      // marker.args = [ref, sendInput]
      sendCapture = marker.args[1] as Record<string, unknown>;
      return { messageId: "sent-1" };
    }
    if (marker.op === "filters.delete") {
      deleteFilterCalls.push(marker.args);
      return undefined;
    }
    throw new Error(`unexpected op ${marker.op}`);
  },
  // A module mock replaces the module for every file loaded after this one, and
  // `mock.restore()` does not put it back — so the fake has to carry the names
  // this suite never calls too. Without them, the first later file to import the
  // barrel (which re-exports them) dies on "export not found" before any of its
  // tests run.
  runWithGoogleAuth: async () => {
    throw new Error("runWithGoogleAuth is not stubbed by gmailAdapter.test.ts");
  },
  exchangeCodeAndProfile: async () => {
    throw new Error("exchangeCodeAndProfile is not stubbed by gmailAdapter.test.ts");
  },
}));

const { createGmailAdapter } = await import("./gmailAdapter");

describe("gmailAdapter.sendReply", () => {
  test("threads the reply: send gets the original's threadId + Message-ID", async () => {
    sendCapture = null;
    const adapter = createGmailAdapter();

    const result = await adapter.sendReply({
      account: "me@example.com",
      to: ["sender@example.com"],
      subject: "Re: Hi",
      body: "thanks",
      replyToMessageId: "orig-1",
    });

    expect(result.messageId).toBe("sent-1");
    expect(sendCapture).not.toBeNull();
    // The crucial threading bits derived from the fetched original:
    expect(sendCapture!.threadId).toBe("thread-9");
    expect(sendCapture!.inReplyToHeader).toBe("<abc@mail.gmail.com>");
    // And the caller-provided fields are passed through:
    expect(sendCapture!.subject).toBe("Re: Hi");
    expect(sendCapture!.to).toEqual(["sender@example.com"]);
  });

  // The compose window's Cc field (#96) only means anything if the address
  // list reaches Gmail's send input, so the adapter passes it through as-is —
  // including the absent case, which must not become an empty header.
  test("passes a Cc list through, and leaves it undefined when there is none", async () => {
    sendCapture = null;
    const adapter = createGmailAdapter();

    await adapter.sendReply({
      account: "me@example.com",
      to: ["sender@example.com"],
      cc: ["watcher@example.com"],
      subject: "Re: Hi",
      body: "thanks",
      replyToMessageId: "orig-1",
    });
    expect(sendCapture!.cc).toEqual(["watcher@example.com"]);

    sendCapture = null;
    await adapter.sendReply({
      account: "me@example.com",
      to: ["sender@example.com"],
      subject: "Re: Hi",
      body: "thanks",
      replyToMessageId: "orig-1",
    });
    expect(sendCapture!.cc).toBeUndefined();
  });

  test("inReplyToHeader is undefined when the original has no Message-ID", async () => {
    sendCapture = null;
    // Swap the original to one without a Message-ID header.
    ORIGINAL.payload.headers = [{ name: "Subject", value: "Hi" }];
    const adapter = createGmailAdapter();

    await adapter.sendReply({
      account: "me@example.com",
      to: ["sender@example.com"],
      subject: "Re: Hi",
      body: "thanks",
      replyToMessageId: "orig-1",
    });

    expect(sendCapture!.threadId).toBe("thread-9");
    expect(sendCapture!.inReplyToHeader).toBeUndefined();
  });
});

describe("gmailAdapter.deleteFilter", () => {
  test("routes the account + filter id to GmailFilters.delete", async () => {
    deleteFilterCalls.length = 0;
    const adapter = createGmailAdapter();

    await adapter.deleteFilter({
      account: "me@example.com",
      filterId: "filter-7",
    });

    expect(deleteFilterCalls).toEqual([[{ email: "me@example.com" }, "filter-7"]]);
  });
});
