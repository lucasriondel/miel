import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { messageDetail } from "../../api/messageDetail.fixture";
import type { MessageDetail } from "../../api/types";

// The compose windows as a user meets them (the redesign's "Compose & Reply"):
// open one from an entry point, type into the chip fields, draft with the AI,
// send, minimize, discard. Rendered with `fetch` as the seam, so the URL and
// body every request is built with are the ones asserted, and every request the
// suite has not seeded for is refused rather than answered with a silent `{}`.

/**
 * The real api client, put back before the subjects are imported: a bun module
 * mock is process-global, and a suite whose seam is `fetch` would otherwise
 * inherit whichever client stub ran last (see `rowPromosWiring.test.tsx`).
 */
const realClient = await import("../../api/client.ts?real");
mock.module("../../api/client", () => ({ ...realClient }));

const { ComposeProvider, useCompose } = await import("./ComposeProvider");

interface Request {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

const requests: Request[] = [];
type Answer = { status?: number; body: unknown };
let answers: Record<string, (req: Request) => Answer> = {};

const ACCOUNT = {
  id: "acc-1",
  email: "you@example.com",
  displayName: "You Person",
  nickname: null,
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: null,
};

const DRAFT = { subject: "Re: Lunch?", body: "Thursday works for me.", model: "m", runId: "r" };

const baseAnswers = (): Record<string, (req: Request) => Answer> => ({
  "GET /accounts": () => ({ body: { accounts: [ACCOUNT] } }),
  "POST /compose/send": () => ({ body: { ok: true, sentMessageId: "s-1", threadId: "t-new" } }),
  "POST /compose/generate": () => ({
    body: { subject: "Dinner", body: "Shall we have dinner at 9?", model: "m", runId: "r" },
  }),
  "POST /messages/acc-1/msg-1/generate-reply": () => ({ body: DRAFT }),
  "POST /messages/acc-1/msg-1/send-reply": () => ({
    body: { ok: true, sentMessageId: "s-2", threadId: "th-1" },
  }),
  "POST /messages/acc-1/msg-1/archive": () => ({ body: { ok: true, threadId: "th-1" } }),
  "PUT /compose/drafts": () => ({
    body: { ok: true, draftId: "d-1", savedAt: "2026-11-18T10:41:00.000Z" },
  }),
  "DELETE /compose/drafts/acc-1/d-1": () => ({ body: { ok: true } }),
  "GET /accounts/acc-1/send-as": () => ({ body: { aliases: [] } }),
  "GET /accounts/acc-1/contacts": () => ({ body: { items: [] } }),
  "GET /messages/acc-1/msg-1/quote": () => ({ body: QUOTE }),
  "POST /messages/acc-1/msg-1/forward": () => ({
    body: { ok: true, sentMessageId: "s-3", threadId: "th-1" },
  }),
});

const QUOTE = {
  reply: {
    attribution: "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@example.com> wrote:",
    text: "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@example.com> wrote:\n> Are you free on Thursday?",
    html: "<blockquote>Are you free on Thursday?</blockquote>",
  },
  forward: {
    attribution: "---------- Forwarded message ---------",
    text: "---------- Forwarded message ---------\nFrom: Claire Martin <claire@example.com>\nDate: Thu 30 Oct 2025 at 18:02\nSubject: Lunch?\nTo: you@example.com\n\nAre you free on Thursday?",
    html: "",
  },
  attachments: [
    { attachmentId: "att-1", filename: "menu.pdf", mimeType: "application/pdf", size: 41_000 },
  ],
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  requests.length = 0;
  answers = baseAnswers();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api/, "");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const req = { method, path, body };
    requests.push(req);
    const answer = answers[`${method} ${path}`];
    if (!answer) throw new Error(`unexpected request: ${method} ${path}`);
    const { status = 200, body: payload } = answer(req);
    return new Response(JSON.stringify(payload), { status });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const MESSAGE: MessageDetail = messageDetail({
  accountEmail: "you@example.com",
  fromEmail: "claire@example.com",
  fromName: "Claire Martin",
  toEmails: ["you@example.com", "samy@example.com"],
  replyAllCc: ["samy@example.com", "nathalie@example.com"],
  subject: "Lunch?",
  bodyText: "Are you free on Thursday?",
});

/** The entry points, as the sidebar and the reader call them. */
const Launchers = () => {
  const { openNew, openReply } = useCompose();
  return (
    <div>
      <button type="button" onClick={() => openNew("acc-1")}>
        launch new
      </button>
      <button type="button" onClick={() => openReply(MESSAGE, "reply")}>
        launch reply
      </button>
      <button type="button" onClick={() => openReply(MESSAGE, "replyAll")}>
        launch reply all
      </button>
      <button type="button" onClick={() => openReply(MESSAGE, "forward")}>
        launch forward
      </button>
    </div>
  );
};

const renderCompose = async (draftSaveDelayMs = 60_000) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ComposeProvider draftSaveDelayMs={draftSaveDelayMs}>
          <Launchers />
        </ComposeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // `openNew` needs the account list to know which mailbox it sends from.
  await waitFor(() => expect(requests.some((r) => r.path === "/accounts")).toBe(true));
  await act(async () => {});
  return view;
};

const launch = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const win = (name: RegExp | string) => screen.getByRole("region", { name });
const sends = () =>
  requests.filter((r) => r.method !== "GET" && !r.path.startsWith("/compose/drafts"));

/** Types into a chip field and commits with Enter, the way a user adds a recipient. */
const addRecipient = (label: "To" | "Cc" | "Bcc", address: string) => {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: address } });
  fireEvent.keyDown(input, { key: "Enter" });
};
const typeBody = (text: string) =>
  fireEvent.change(screen.getByLabelText("Message body"), { target: { value: text } });

describe("a new message", () => {
  test("opens blank from Compose, sends from the mailbox on screen, and confirms", async () => {
    await renderCompose();
    launch("launch new");

    const w = within(win("New message"));
    expect(w.getByText("you@example.com")).toBeDefined();
    expect(w.getByText("Add a recipient to send")).toBeDefined();

    addRecipient("To", "claire@example.com");
    fireEvent.click(w.getByRole("button", { name: "Add Bcc" }));
    addRecipient("Bcc", "archive@example.com");
    fireEvent.change(w.getByLabelText("Subject"), { target: { value: "Dinner" } });
    typeBody("Shall we?");
    fireEvent.click(w.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/^Sent to claire@example.com/)).toBeDefined());
    expect(sends()).toEqual([
      {
        method: "POST",
        path: "/compose/send",
        body: {
          accountId: "acc-1",
          to: ["claire@example.com"],
          bcc: ["archive@example.com"],
          subject: "Dinner",
          body: "Shall we?",
        },
      },
    ]);
    const link = screen.getByRole("link", { name: /View in Gmail/ });
    expect(link.getAttribute("href")).toBe(
      "https://mail.google.com/mail/u/you%40example.com/#all/t-new",
    );
    // The controls are replaced by the confirmation: nothing offers a second copy.
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  test("Compose again restores the blank window instead of stacking a second", async () => {
    await renderCompose();
    launch("launch new");
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    launch("launch new");

    expect(screen.getAllByRole("region", { name: "New message" })).toHaveLength(1);
    expect(screen.getByLabelText("Message body")).toBeDefined();
  });

  test("a comma commits a chip; a non-address stays red and keeps Send off", async () => {
    await renderCompose();
    launch("launch new");
    typeBody("Hi");

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "one@example.com, two" } });
    expect(screen.getByRole("button", { name: "Remove one@example.com" })).toBeDefined();
    // The half-typed entry after the comma is left exactly as typed.
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("two");

    fireEvent.blur(screen.getByLabelText("To"));
    expect(screen.getByRole("alert").textContent).toContain("“two” isn’t an email address");
    expect(screen.getByText("Fix the address in red to send")).toBeDefined();
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
  });

  test("drafts with the AI through /compose/generate, then asks before replacing an edit", async () => {
    await renderCompose();
    launch("launch new");
    addRecipient("To", "claire@example.com");

    fireEvent.change(screen.getByLabelText("Instruction for the AI"), {
      target: { value: "invite her to dinner" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Draft/ }));

    await waitFor(() =>
      expect((screen.getByLabelText("Message body") as HTMLTextAreaElement).value).toBe(
        "Shall we have dinner at 9?",
      ),
    );
    const { requestId, ...generated } = requests.find((r) => r.path === "/compose/generate")!
      .body as Record<string, unknown>;
    expect(generated).toEqual({
      accountId: "acc-1",
      prompt: "invite her to dinner",
      to: ["claire@example.com"],
    });
    // Chosen by the window, so its Stop can name this generation.
    expect(typeof requestId).toBe("string");
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("Dinner");
    expect(screen.getByText(/Drafted from “invite her to dinner”/)).toBeDefined();

    typeBody("My own words");
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
    expect(screen.getByText("Replace the body you edited with a new draft?")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect((screen.getByLabelText("Message body") as HTMLTextAreaElement).value).toBe(
      "My own words",
    );
    expect(requests.filter((r) => r.path === "/compose/generate")).toHaveLength(1);
  });

  test("a provider that cannot run says drafting is off and points at Settings", async () => {
    answers["POST /compose/generate"] = () => ({
      status: 503,
      body: { error: "claude_unavailable" },
    });
    await renderCompose();
    launch("launch new");
    fireEvent.change(screen.getByLabelText("Instruction for the AI"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /^Draft/ }));

    await waitFor(() => expect(screen.getByText(/Drafting is off/)).toBeDefined());
    expect(screen.getByRole("link", { name: "Open Settings" }).getAttribute("href")).toBe(
      "/settings",
    );
  });
});

describe("answering a message", () => {
  test("Reply prefills the sender and Re:, and goes through send-reply", async () => {
    await renderCompose();
    launch("launch reply");

    const w = within(win("Reply: Re: Lunch?"));
    expect(w.getByRole("button", { name: "Remove Claire Martin" })).toBeDefined();
    expect((w.getByLabelText("Subject") as HTMLInputElement).value).toBe("Re: Lunch?");
    expect(w.queryByLabelText("Cc")).toBeNull();

    typeBody("Yes!");
    fireEvent.click(w.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/^Sent to Claire Martin/)).toBeDefined());
    expect(sends()).toEqual([
      {
        method: "POST",
        path: "/messages/acc-1/msg-1/send-reply",
        body: { subject: "Re: Lunch?", body: "Yes!", to: ["claire@example.com"] },
      },
    ]);
  });

  test("Reply all prefills Cc with the other participants", async () => {
    await renderCompose();
    launch("launch reply all");

    const w = within(win("Reply all: Re: Lunch?"));
    expect(w.getByRole("button", { name: "Remove samy@example.com" })).toBeDefined();
    expect(w.getByRole("button", { name: "Remove nathalie@example.com" })).toBeDefined();

    typeBody("See you all");
    fireEvent.click(w.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]!.body).toEqual({
      subject: "Re: Lunch?",
      body: "See you all",
      to: ["claire@example.com"],
      cc: ["samy@example.com", "nathalie@example.com"],
      replyAll: true,
    });
  });

  test("Forward empties To, says Fwd: and sends only what was typed through forward", async () => {
    await renderCompose();
    launch("launch forward");

    const w = within(win("Forward: Fwd: Lunch?"));
    expect(w.queryByRole("button", { name: /^Remove [a-z]+@/ })).toBeNull();
    // The original is the server's to carry: shown under the body, never typed into it.
    expect((w.getByLabelText("Message body") as HTMLTextAreaElement).value).toBe("");
    const block = await waitFor(() => w.getByRole("region", { name: "Forwarded message" }));
    expect(block.textContent).toContain("From: Claire Martin <claire@example.com>");
    expect(block.textContent).toContain("Are you free on Thursday?");
    // A forward with nothing typed is still a forward.
    addRecipient("To", "nathalie@example.com");
    fireEvent.click(w.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]).toEqual({
      method: "POST",
      path: "/messages/acc-1/msg-1/forward",
      body: {
        to: ["nathalie@example.com"],
        subject: "Fwd: Lunch?",
        body: "",
        keepAttachmentIds: ["att-1"],
      },
    });
  });

  test("Send & archive sends the reply, then archives the message answered", async () => {
    await renderCompose();
    launch("launch reply");
    typeBody("Done.");

    fireEvent.keyDown(screen.getByLabelText("Message body"), {
      key: "Enter",
      metaKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(screen.getByText(/· archived$/)).toBeDefined());
    expect(sends().map((r) => r.path)).toEqual([
      "/messages/acc-1/msg-1/send-reply",
      "/messages/acc-1/msg-1/archive",
    ]);
  });

  test("a refused send keeps the draft and says Gmail's reason", async () => {
    answers["POST /messages/acc-1/msg-1/send-reply"] = () => ({
      status: 502,
      body: { error: "gmail_error", message: "Invalid To header" },
    });
    await renderCompose();
    launch("launch reply");
    typeBody("Yes!");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Gmail refused the message: “Invalid To header”",
      ),
    );
    expect(screen.getByText("Not sent")).toBeDefined();
    expect(screen.getByRole("button", { name: /Retry send/ })).toBeDefined();
    expect((screen.getByLabelText("Message body") as HTMLTextAreaElement).value).toBe("Yes!");
  });
});

describe("minimizing and closing", () => {
  test("minimizes to its title bar and restores without losing a keystroke", async () => {
    await renderCompose();
    launch("launch reply");
    typeBody("half a sentence");

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    expect(screen.queryByLabelText("Message body")).toBeNull();
    expect(screen.getByLabelText("Unsent")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect((screen.getByLabelText("Message body") as HTMLTextAreaElement).value).toBe(
      "half a sentence",
    );
  });

  test("closing an untouched reply simply closes it", async () => {
    await renderCompose();
    launch("launch reply");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: /Reply/ })).toBeNull();
  });

  test("closing unsent work asks in place first", async () => {
    await renderCompose();
    launch("launch reply");
    typeBody("unsent");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Discard this message?")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((screen.getByLabelText("Message body") as HTMLTextAreaElement).value).toBe("unsent");

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard" }),
    );
    expect(screen.queryByRole("region", { name: /Reply/ })).toBeNull();
  });
});

describe("Gmail drafts", () => {
  test("autosaves after a pause, names the draft on send, and says when it saved", async () => {
    await renderCompose(10);
    launch("launch reply");
    typeBody("Draft me");

    await waitFor(() => expect(screen.getByText(/^Saved to Gmail drafts · /)).toBeDefined());
    expect(requests.find((r) => r.path === "/compose/drafts")!.body).toEqual({
      accountId: "acc-1",
      replyToGmailMessageId: "msg-1",
      to: ["claire@example.com"],
      subject: "Re: Lunch?",
      body: "Draft me",
    });

    // A later pause replaces that draft rather than adding a second.
    typeBody("Draft me again");
    await waitFor(() =>
      expect(requests.filter((r) => r.path === "/compose/drafts")).toHaveLength(2),
    );
    expect(requests.filter((r) => r.path === "/compose/drafts")[1]!.body!.draftId).toBe("d-1");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]!.body!.draftId).toBe("d-1");
  });

  test("discarding takes the draft out of Gmail too", async () => {
    await renderCompose(10);
    launch("launch new");
    addRecipient("To", "claire@example.com");
    typeBody("never mind");
    await waitFor(() => expect(screen.getByText(/^Saved to Gmail drafts/)).toBeDefined());

    fireEvent.keyDown(screen.getByLabelText("Message body"), { key: "Backspace", metaKey: true });
    expect(screen.getByText("Discard this draft? It leaves Gmail drafts too.")).toBeDefined();
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard" }),
    );

    await waitFor(() =>
      expect(
        requests.some((r) => r.method === "DELETE" && r.path === "/compose/drafts/acc-1/d-1"),
      ).toBe(true),
    );
    expect(screen.queryByRole("region", { name: "New message" })).toBeNull();
  });
});

describe("the dock", () => {
  test("floats bottom-right over the page, between popovers and modals", async () => {
    await renderCompose();
    launch("launch new");

    const dock = win("New message").parentElement!;
    expect(dock.className).toContain("fixed");
    expect(dock.className).toContain("bottom-0");
    expect(dock.className).toContain("justify-end");
    expect(dock.className).toContain("pointer-events-none");
    expect(dock.className).toContain("z-[80]");
  });

  test("opening a second window folds the first to its title bar", async () => {
    await renderCompose();
    launch("launch reply");
    launch("launch forward");

    expect(screen.getAllByLabelText("Message body")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Restore" })).toBeDefined();
  });
});
