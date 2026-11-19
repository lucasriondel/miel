import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { messageDetail } from "../../api/messageDetail.fixture";
import type { MessageDetail } from "../../api/types";
import { MielToaster } from "../../components/MielToaster";

// The compose title bar's mode chip (Compose & Reply › "Switching mode inside
// the window"), rendered with `fetch` as the seam; a request the suite has not
// seeded is refused. It changes what was prefilled, never what was typed, and
// the send and the Gmail draft follow the mode the window is in at the time.

const realClient = await import("../../api/client.ts?real");
mock.module("../../api/client", () => ({ ...realClient }));

const { ComposeProvider, useCompose } = await import("../compose/ComposeProvider");

interface Request {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

const requests: Request[] = [];
type Answer = { status?: number; body: unknown };
let answers: Record<string, (req: Request) => Answer> = {};

const PRO = {
  id: "acc-1",
  email: "lucas@carrier.studio",
  displayName: "Lucas Riondel",
  nickname: "Lucas — Pro",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: null,
};

const QUOTE = {
  reply: {
    attribution: "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@example.com> wrote:",
    text: "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@example.com> wrote:\n> We're thinking 8pm.",
    html: "",
  },
  forward: {
    attribution: "---------- Forwarded message ---------",
    text: "---------- Forwarded message ---------\nFrom: Claire Martin <claire@example.com>\n\nWe're thinking 8pm.",
    html: "",
  },
  attachments: [
    { attachmentId: "att-1", filename: "Menu.pdf", mimeType: "application/pdf", size: 84_000 },
    { attachmentId: "att-2", filename: "Map.png", mimeType: "image/png", size: 41_000 },
  ],
};

let draftCount = 0;
const baseAnswers = (): typeof answers => ({
  "GET /accounts": () => ({ body: { accounts: [PRO] } }),
  "GET /accounts/acc-1/send-as": () => ({ body: { aliases: [] } }),
  "GET /accounts/acc-1/contacts": () => ({ body: { items: [] } }),
  "GET /messages/acc-1/msg-1/quote": () => ({ body: QUOTE }),
  "POST /messages/acc-1/msg-1/send-reply": () => ({
    body: { ok: true, sentMessageId: "s-2", threadId: "th-1" },
  }),
  "POST /messages/acc-1/msg-1/forward": () => ({
    body: { ok: true, sentMessageId: "s-3", threadId: "th-2" },
  }),
  "PUT /compose/drafts": (req) => ({
    body: {
      ok: true,
      draftId: (req.body!.draftId as string | undefined) ?? `d-${(draftCount += 1)}`,
      savedAt: "2026-11-18T10:41:00.000Z",
    },
  }),
  "DELETE /compose/drafts/acc-1/d-1": () => ({ body: { ok: true } }),
});

const originalFetch = globalThis.fetch;

beforeEach(() => {
  requests.length = 0;
  draftCount = 0;
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
  accountEmail: "lucas@carrier.studio",
  fromEmail: "claire@example.com",
  fromName: "Claire Martin",
  subject: "Dinner Saturday?",
  replyAllCc: ["samy@example.com", "nathalie@example.com"],
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
    </div>
  );
};

const renderCompose = async (draftSaveDelayMs = 60_000) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ComposeProvider draftSaveDelayMs={draftSaveDelayMs}>
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
const sends = () =>
  requests.filter((r) => r.method !== "GET" && !r.path.startsWith("/compose/drafts"));
const drafts = () => requests.filter((r) => r.path.startsWith("/compose/drafts"));
const chip = () => screen.getByRole("button", { name: /change how this answers$/ });
const switchTo = async (label: string) => {
  fireEvent.click(chip());
  const menu = screen.getByRole("menu", { name: "Reply mode" });
  const item = within(menu)
    .getAllByRole("menuitemradio")
    .find((i) => i.querySelector("span > span")?.textContent === label);
  fireEvent.click(item!);
  await act(async () => {});
};
const addTo = (address: string) => {
  const input = screen.getByLabelText("To");
  fireEvent.change(input, { target: { value: address } });
  fireEvent.keyDown(input, { key: "Enter" });
};
const recipients = (label: "To" | "Cc") =>
  within(screen.getByText(label, { selector: "label" }).parentElement!)
    .queryAllByRole("button", { name: /^Remove / })
    .map((b) => b.getAttribute("aria-label")!.replace(/^Remove /, ""));
const subject = () => (screen.getByLabelText("Subject") as HTMLInputElement).value;
const body = () => (screen.getByLabelText("Message body") as HTMLTextAreaElement).value;

describe("the mode chip", () => {
  test("is drawn on a reply and not on a new mail", async () => {
    await renderCompose();
    launch("launch new");
    expect(screen.queryByRole("button", { name: /change how this answers$/ })).toBeNull();
    launch("launch reply");
    expect(chip().textContent).toBe("Reply");
  });

  test("its menu names who each mode reaches, checks the current one, and walks with the arrows", async () => {
    await renderCompose();
    launch("launch reply");
    await screen.findByRole("button", { name: "Show quoted text" });

    fireEvent.click(chip());
    const menu = screen.getByRole("menu", { name: "Reply mode" });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual([
      "ReplyClaire Martin",
      "Reply allClaire Martin · Cc samy, nathalie",
      "ForwardEmpties To · keeps 2 attachments",
    ]);
    expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);

    items[0]!.focus();
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]!);
    fireEvent.keyDown(items[1]!, { key: "End" });
    expect(document.activeElement).toBe(items[2]!);

    // Escape closes the menu and nothing else: the window stays open.
    fireEvent.keyDown(items[2]!, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Reply mode" })).toBeNull();
    expect(screen.getByRole("region", { name: /^Reply: / })).toBeDefined();
  });

  test("reply → reply all → forward → reply re-derives what each mode owns and keeps what was typed", async () => {
    await renderCompose();
    launch("launch reply");
    await screen.findByRole("button", { name: "Show quoted text" });
    addTo("paul@example.com");
    fireEvent.change(screen.getByLabelText("Message body"), {
      target: { value: "Count me in." },
    });

    await switchTo("Reply all");
    expect(chip().textContent).toBe("Reply all");
    expect(recipients("To")).toEqual(["Claire Martin", "paul@example.com"]);
    expect(recipients("Cc")).toEqual(["samy@example.com", "nathalie@example.com"]);
    expect(subject()).toBe("Re: Dinner Saturday?");
    expect(screen.getByRole("button", { name: "Show quoted text" })).toBeDefined();

    await switchTo("Forward");
    expect(chip().textContent).toBe("Forward");
    expect(recipients("To")).toEqual(["paul@example.com"]);
    expect(screen.queryByLabelText("Cc")).toBeNull();
    expect(subject()).toBe("Fwd: Dinner Saturday?");
    expect(screen.queryByRole("button", { name: "Show quoted text" })).toBeNull();
    expect(screen.getByRole("region", { name: "Forwarded message" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove Menu.pdf" })).toBeDefined();
    expect(body()).toBe("Count me in.");

    await switchTo("Reply");
    expect(recipients("To")).toEqual(["Claire Martin", "paul@example.com"]);
    expect(subject()).toBe("Re: Dinner Saturday?");
    expect(screen.queryByRole("region", { name: "Forwarded message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Menu.pdf" })).toBeNull();
    expect(body()).toBe("Count me in.");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]).toMatchObject({
      path: "/messages/acc-1/msg-1/send-reply",
      body: {
        to: ["claire@example.com", "paul@example.com"],
        subject: "Re: Dinner Saturday?",
        body: "Count me in.",
      },
    });
  });

  test("an edited subject is kept, and a forward sends through the forward route with its files", async () => {
    await renderCompose();
    launch("launch reply");
    await screen.findByRole("button", { name: "Show quoted text" });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Saturday, then" } });

    await switchTo("Forward");
    expect(subject()).toBe("Saturday, then");
    fireEvent.click(screen.getByRole("button", { name: "Remove Map.png" }));
    addTo("nathalie@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]).toMatchObject({
      path: "/messages/acc-1/msg-1/forward",
      body: {
        to: ["nathalie@example.com"],
        subject: "Saturday, then",
        keepAttachmentIds: ["att-1"],
      },
    });
  });

  test("a reply all sends as one", async () => {
    await renderCompose();
    launch("launch reply");
    await switchTo("Reply all");
    fireEvent.change(screen.getByLabelText("Message body"), { target: { value: "All in." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0]).toMatchObject({
      path: "/messages/acc-1/msg-1/send-reply",
      body: { cc: ["samy@example.com", "nathalie@example.com"], replyAll: true },
    });
  });

  test("a reply's Gmail draft is replaced by a forward's, not edited into one", async () => {
    await renderCompose(10);
    launch("launch reply");
    fireEvent.change(screen.getByLabelText("Message body"), { target: { value: "Draft me" } });
    await waitFor(() => expect(screen.getByText(/^Saved to Gmail drafts · /)).toBeDefined());
    expect(drafts()[0]!.body).toMatchObject({ replyToGmailMessageId: "msg-1" });

    await switchTo("Forward");
    await waitFor(() => expect(drafts().filter((r) => r.method === "PUT")).toHaveLength(2));
    expect(drafts().find((r) => r.method === "DELETE")!.path).toBe("/compose/drafts/acc-1/d-1");
    const forwardDraft = drafts().filter((r) => r.method === "PUT")[1]!.body!;
    expect(forwardDraft.draftId).toBeUndefined();
    expect(forwardDraft.replyToGmailMessageId).toBeUndefined();
    expect(forwardDraft.subject).toBe("Fwd: Dinner Saturday?");
  });
});
