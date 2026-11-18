import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { messageDetail } from "../../api/messageDetail.fixture";
import type { MessageDetail } from "../../api/types";
import { MielToaster } from "../../components/MielToaster";

// What a send carries beyond its text (Compose & Reply › 3, 4, 5, 6, 7): the
// From menu, address suggestions, the quoted thread, files, schedule send, and
// the AI's real Stop and refinement. Rendered with `fetch` (and, for uploads,
// `XMLHttpRequest`) as the seam; a request the suite has not seeded is refused.

const realClient = await import("../../api/client.ts?real");
mock.module("../../api/client", () => ({ ...realClient }));

const { ComposeProvider, useCompose } = await import("./ComposeProvider");

interface Request {
  method: string;
  path: string;
  query: string;
  body: Record<string, unknown> | null;
}

const requests: Request[] = [];
type Answer = { status?: number; body: unknown };
let answers: Record<string, (req: Request) => Answer | Promise<Answer>> = {};

const account = (id: string, email: string, nickname: string) => ({
  id,
  email,
  displayName: "Lucas Riondel",
  nickname,
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: null,
});
const PRO = account("acc-1", "lucas@carrier.studio", "Lucas — Pro");
const PERSO = account("acc-2", "lucas@example.com", "Lucas — Perso");

const QUOTE = {
  reply: {
    attribution: "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@example.com> wrote:",
    text: "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@example.com> wrote:\n> We're thinking 8pm.\n>\n> Bring Nathalie.",
    html: "",
  },
  forward: {
    attribution: "---------- Forwarded message ---------",
    text: "---------- Forwarded message ---------\nFrom: Deutsche Bahn <db@bahn.de>\n\nYour tickets are attached.",
    html: "",
  },
  attachments: [
    {
      attachmentId: "att-1",
      filename: "DB_Ticket.pdf",
      mimeType: "application/pdf",
      size: 184_000,
    },
    { attachmentId: "att-2", filename: "Seat.pdf", mimeType: "application/pdf", size: 41_000 },
  ],
};

const baseAnswers = (): typeof answers => ({
  "GET /accounts": () => ({ body: { accounts: [PRO, PERSO] } }),
  "GET /accounts/acc-1/send-as": () => ({
    body: {
      aliases: [
        {
          email: "lucas@carrier.studio",
          displayName: null,
          isPrimary: true,
          isDefault: true,
          verified: true,
        },
        {
          email: "hello@carrier.studio",
          displayName: "Carrier Studio",
          isPrimary: false,
          isDefault: false,
          verified: true,
        },
      ],
    },
  }),
  "GET /accounts/acc-1/contacts": (req) => ({
    body: {
      items: new URLSearchParams(req.query).get("q")?.startsWith("cla")
        ? [
            {
              email: "clara@stb.fr",
              name: "Clara Dubois",
              timesContacted: 4,
              lastContactedAt: null,
            },
            {
              email: "clarisse@orange.fr",
              name: "Clarisse Petit",
              timesContacted: 2,
              lastContactedAt: null,
            },
          ]
        : [],
    },
  }),
  "GET /accounts/acc-2/contacts": () => ({ body: { items: [] } }),
  "GET /messages/acc-1/msg-1/quote": () => ({ body: QUOTE }),
  "POST /compose/send": () => ({ body: { ok: true, sentMessageId: "s-1", threadId: "t-new" } }),
  "POST /messages/acc-1/msg-1/send-reply": () => ({
    body: { ok: true, sentMessageId: "s-2", threadId: "th-1" },
  }),
  "POST /messages/acc-1/msg-1/forward": () => ({
    body: { ok: true, sentMessageId: "s-3", threadId: "th-1" },
  }),
  "POST /compose/scheduled": (req) => ({
    status: 201,
    body: { id: "sch-1", sendAt: req.body!.sendAt, status: "pending" },
  }),
  "DELETE /compose/scheduled/sch-1": () => ({ body: { id: "sch-1", status: "cancelled" } }),
});

const ignore = () => {};
const originalFetch = globalThis.fetch;
const OriginalXhr = globalThis.XMLHttpRequest;

/** What the fake upload endpoint answers, per file name. */
let uploadAnswer: (name: string) => { status: number; body: unknown } = (name) => ({
  status: 201,
  body: { id: `up-${name}`, filename: name, mimeType: "application/pdf", size: 3000 },
});
const uploadsSent: { accountId: string; name: string }[] = [];

/** An upload as the browser makes it: progress, then the server's answer. */
class FakeXhr {
  status = 0;
  responseText = "";
  private listeners = new Map<string, (e?: unknown) => void>();
  private progress: ((e: ProgressEvent) => void) | null = null;
  upload = {
    addEventListener: (_type: string, listener: (e: ProgressEvent) => void) => {
      this.progress = listener;
    },
  };
  addEventListener(type: string, listener: (e?: unknown) => void) {
    this.listeners.set(type, listener);
  }
  open() {}
  setRequestHeader() {}
  abort() {
    this.listeners.get("abort")?.();
  }
  send(form: FormData) {
    const file = form.get("file") as File;
    uploadsSent.push({ accountId: String(form.get("accountId")), name: file.name });
    queueMicrotask(() => {
      this.progress?.({ lengthComputable: true, loaded: 1, total: 2 } as ProgressEvent);
      const answer = uploadAnswer(file.name);
      this.status = answer.status;
      this.responseText = JSON.stringify(answer.body);
      this.listeners.get("load")?.();
    });
  }
}

beforeEach(() => {
  requests.length = 0;
  uploadsSent.length = 0;
  answers = baseAnswers();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api/, "");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const req = { method, path, query: url.search, body };
    requests.push(req);
    const answer = answers[`${method} ${path}`];
    if (!answer) throw new Error(`unexpected request: ${method} ${path}`);
    const { status = 200, body: payload } = await answer(req);
    return new Response(JSON.stringify(payload), { status });
  }) as typeof fetch;
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.XMLHttpRequest = OriginalXhr;
  uploadAnswer = (name) => ({
    status: 201,
    body: { id: `up-${name}`, filename: name, mimeType: "application/pdf", size: 3000 },
  });
});

const MESSAGE: MessageDetail = messageDetail({
  accountEmail: "lucas@carrier.studio",
  fromEmail: "claire@example.com",
  fromName: "Claire Martin",
  subject: "Dinner Saturday?",
  bodyText: "We're thinking 8pm.\n\nBring Nathalie.",
});

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
      <button type="button" onClick={() => openReply(MESSAGE, "forward")}>
        launch forward
      </button>
    </div>
  );
};

const renderCompose = async () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ComposeProvider draftSaveDelayMs={60_000}>
          <Launchers />
        </ComposeProvider>
        <MielToaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(requests.some((r) => r.path === "/accounts")).toBe(true));
  await act(async () => {});
};

const launch = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const sends = () => requests.filter((r) => r.method !== "GET");
const addRecipient = (address: string) => {
  const input = screen.getByLabelText("To");
  fireEvent.change(input, { target: { value: address } });
  fireEvent.keyDown(input, { key: "Enter" });
};
const typeBody = (text: string) =>
  fireEvent.change(screen.getByLabelText("Message body"), { target: { value: text } });
const attach = (...files: File[]) =>
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files } });
const pdf = (name: string, bytes = 3000) =>
  new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

describe("the From menu", () => {
  test("offers the mailbox, its verified aliases and the other mailboxes; an alias is sent as from", async () => {
    await renderCompose();
    launch("launch new");

    const from = await screen.findByRole("button", { name: /^From Lucas — Pro/ });
    fireEvent.click(from);
    const menu = screen.getByRole("menu", { name: "Send from" });
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual([
      "Lucas — Prolucas@carrier.studio",
      "Carrier Studiohello@carrier.studio",
      "Lucas — Persolucas@example.com",
    ]);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /hello@carrier.studio/ }));

    addRecipient("claire@example.com");
    typeBody("Hi");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]!.body).toMatchObject({ accountId: "acc-1", from: "hello@carrier.studio" });
  });

  test("a reply answered from another mailbox names it, and is marked against the one it arrived in", async () => {
    await renderCompose();
    launch("launch reply");

    fireEvent.click(await screen.findByRole("button", { name: /^From Lucas — Pro/ }));
    expect(screen.getByRole("menuitemradio", { name: /received here/ }).textContent).toContain(
      "lucas@carrier.studio",
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: /lucas@example.com/ }));
    typeBody("Count me in.");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]!.path).toBe("/messages/acc-1/msg-1/send-reply");
    expect(sends()[0]!.body).toMatchObject({ fromAccountId: "acc-2" });
  });
});

describe("address suggestions", () => {
  test("people already written to are suggested; the arrows and Enter take one as a named chip", async () => {
    await renderCompose();
    launch("launch new");

    const to = screen.getByLabelText("To");
    fireEvent.change(to, { target: { value: "cla" } });
    const list = await screen.findByRole("listbox", { name: "Suggested recipients" });
    expect(to.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.getAttribute("aria-selected")),
    ).toEqual(["true", "false"]);

    fireEvent.keyDown(to, { key: "ArrowDown" });
    expect(to.getAttribute("aria-activedescendant")).toBe(
      within(list).getAllByRole("option")[1]!.id,
    );
    fireEvent.keyDown(to, { key: "Enter" });

    expect(screen.getByRole("button", { name: "Remove Clarisse Petit" })).toBeDefined();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(requests.find((r) => r.path === "/accounts/acc-1/contacts")!.query).toContain("q=cla");
  });

  test("Escape hides the list and leaves the window open", async () => {
    await renderCompose();
    launch("launch new");
    const to = screen.getByLabelText("To");
    fireEvent.change(to, { target: { value: "cla" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(to, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("region", { name: "New message" })).toBeDefined();
  });
});

describe("the quoted thread", () => {
  test("is collapsed under a reply and sent by the server — nothing is quoted into the body", async () => {
    await renderCompose();
    launch("launch reply");
    await screen.findByRole("button", { name: "Show quoted text" });
    typeBody("Perfect — 9pm it is.");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]!.body).toEqual({
      subject: "Re: Dinner Saturday?",
      body: "Perfect — 9pm it is.",
      to: ["claire@example.com"],
    });
  });

  test("expanded, it can be trimmed, and the trimmed text is what goes", async () => {
    await renderCompose();
    launch("launch reply");
    fireEvent.click(await screen.findByRole("button", { name: "Show quoted text" }));
    expect(screen.getByText(QUOTE.reply.attribution)).toBeDefined();
    const quoted = screen.getByLabelText("Quoted text") as HTMLTextAreaElement;
    expect(quoted.value).toBe("We're thinking 8pm.\n\nBring Nathalie.");

    fireEvent.change(quoted, { target: { value: "Bring Nathalie." } });
    typeBody("Will do.");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]!.body).toMatchObject({ quotedText: "Bring Nathalie." });

    expect(screen.getByRole("button", { name: "Hide quoted text" })).toBeDefined();
  });
});

describe("attachments", () => {
  test("each file uploads on its own; the send names the ids in chip order", async () => {
    await renderCompose();
    launch("launch new");
    attach(pdf("Quote.pdf"), pdf("Dinner.ics"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove Dinner.ics" })).toBeDefined(),
    );
    expect(uploadsSent).toEqual([
      { accountId: "acc-1", name: "Quote.pdf" },
      { accountId: "acc-1", name: "Dinner.ics" },
    ]);
    addRecipient("claire@example.com");
    typeBody("Both attached.");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends().some((r) => r.path === "/compose/send")).toBe(true));
    expect(sends().find((r) => r.path === "/compose/send")!.body).toMatchObject({
      uploadIds: ["up-Quote.pdf", "up-Dinner.ics"],
    });
  });

  test("a refused file says why on its own chip and never blocks the others", async () => {
    uploadAnswer = (name) =>
      name === "Holiday.mov"
        ? {
            status: 413,
            body: { error: "attachment_too_large", message: "48.0 MB — over Gmail's 25 MB." },
          }
        : {
            status: 201,
            body: { id: "up-ok", filename: name, mimeType: "text/calendar", size: 3000 },
          };
    await renderCompose();
    launch("launch new");
    attach(pdf("Holiday.mov"), pdf("Dinner.ics"));

    const refused = await screen.findByRole("alert");
    expect(refused.textContent).toBe("48.0 MB — over Gmail's 25 MB");
    addRecipient("claire@example.com");
    typeBody("Hi");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends().some((r) => r.path === "/compose/send")).toBe(true));
    expect(sends().find((r) => r.path === "/compose/send")!.body).toMatchObject({
      uploadIds: ["up-ok"],
    });
  });

  test("a file over 25 MB is refused before a byte is sent", async () => {
    await renderCompose();
    launch("launch new");
    attach(pdf("Huge.mov", 26 * 1024 * 1024));
    expect((await screen.findByRole("alert")).textContent).toBe("26.0 MB — over Gmail's 25 MB");
    expect(uploadsSent).toEqual([]);
  });

  test("a forward carries the original's files as chips, and a removed one is not kept", async () => {
    await renderCompose();
    launch("launch forward");
    fireEvent.click(await screen.findByRole("button", { name: "Remove Seat.pdf" }));
    addRecipient("nathalie@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]).toMatchObject({
      path: "/messages/acc-1/msg-1/forward",
      body: { keepAttachmentIds: ["att-1"] },
    });
  });
});

describe("schedule send", () => {
  test("a preset holds the mail, closes the window, and Undo cancels it and brings the window back", async () => {
    await renderCompose();
    launch("launch new");
    addRecipient("claire@example.com");
    typeBody("See you then.");

    fireEvent.click(screen.getByRole("button", { name: "Send options" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Tomorrow morning/ }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "New message" })).toBeNull());
    const scheduled = sends().find((r) => r.path === "/compose/scheduled")!;
    expect(scheduled.body).toMatchObject({
      accountId: "acc-1",
      kind: "new",
      to: ["claire@example.com"],
      body: "See you then.",
    });
    const at = new Date(String(scheduled.body!.sendAt));
    expect(at.getHours()).toBe(8);
    expect(at.getTime()).toBeGreaterThan(Date.now());

    expect(await screen.findByText(/^Scheduled for/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "New message" })).toBeDefined());
    expect(
      sends().some((r) => r.method === "DELETE" && r.path === "/compose/scheduled/sch-1"),
    ).toBe(true);
    expect((screen.getByLabelText("Message body") as HTMLTextAreaElement).value).toBe(
      "See you then.",
    );
  });

  test("a reply schedules as a reply of the message it answers", async () => {
    await renderCompose();
    launch("launch reply");
    typeBody("Yes.");
    fireEvent.click(screen.getByRole("button", { name: "Send options" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Monday morning/ }));
    await waitFor(() => expect(sends().some((r) => r.path === "/compose/scheduled")).toBe(true));
    expect(sends().find((r) => r.path === "/compose/scheduled")!.body).toMatchObject({
      kind: "reply",
      sourceGmailMessageId: "msg-1",
    });
  });
});

describe("the AI's Stop and refinement", () => {
  test("Stop names the generation to the server, and its cancellation is not an error", async () => {
    let release: (a: Answer) => void = ignore;
    answers["POST /compose/generate"] = () =>
      new Promise<Answer>((resolve) => {
        release = resolve;
      });
    answers["POST /compose/generations/gen/cancel"] = () => ({
      body: { ok: true, cancelled: true },
    });
    await renderCompose();
    launch("launch new");
    fireEvent.change(screen.getByLabelText("Instruction for the AI"), {
      target: { value: "invite her" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Draft/ }));
    await screen.findByText(/Drafting from/);
    const requestId = String(requests.find((r) => r.path === "/compose/generate")!.body!.requestId);
    answers[`POST /compose/generations/${requestId}/cancel`] = () => ({
      body: { ok: true, cancelled: true },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Stop/ }));
    await waitFor(() =>
      expect(sends().some((r) => r.path === `/compose/generations/${requestId}/cancel`)).toBe(true),
    );
    release({ status: 409, body: { error: "generation_cancelled" } });
    await act(async () => {});
    expect(screen.queryByText(/Couldn’t draft/)).toBeNull();
    expect(screen.getByLabelText("Instruction for the AI")).toBeDefined();
  });

  test("a refinement chip hands the model the current draft to edit", async () => {
    answers["POST /compose/generate"] = () => ({
      body: { subject: "Dinner", body: "Shall we have dinner at 9?", model: "m", runId: "r" },
    });
    await renderCompose();
    launch("launch new");
    fireEvent.change(screen.getByLabelText("Instruction for the AI"), {
      target: { value: "invite her" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Draft/ }));
    await screen.findByText(/Drafted from/);
    fireEvent.click(screen.getByRole("button", { name: "Shorter" }));

    await waitFor(() =>
      expect(requests.filter((r) => r.path === "/compose/generate")).toHaveLength(2),
    );
    expect(requests.filter((r) => r.path === "/compose/generate")[1]!.body).toMatchObject({
      prompt: "Shorter",
      previousDraft: { subject: "Dinner", body: "Shall we have dinner at 9?" },
    });
  });
});

describe("a refused send", () => {
  test("a message that is gone reads as a sentence, not an id", async () => {
    answers["POST /messages/acc-1/msg-1/send-reply"] = () => ({
      status: 404,
      body: { error: "message_not_found", message: "Message not found: msg-1" },
    });
    await renderCompose();
    launch("launch reply");
    typeBody("Hello?");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("The message this answers is no longer in miel");
    expect(banner.textContent).not.toContain("msg-1");
  });
});
