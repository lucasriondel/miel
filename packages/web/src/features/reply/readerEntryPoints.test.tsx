import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { messageDetail } from "../../api/messageDetail.fixture";
import type { MessageDetail } from "../../api/types";

// The two ways into a reply the reader offers (the redesign's "1 · Entry
// points"): the toolbar's Reply split button with its keys, and the draft card
// at the foot of the message — on demand only. Mounted inside the real
// `ComposeProvider`, with `fetch` as the seam, so a press is asserted by the
// window it opens and the request it makes.

const realClient = await import("../../api/client.ts?real");
mock.module("../../api/client", () => ({ ...realClient }));

const { ComposeProvider } = await import("../compose/ComposeProvider");
const { ReplySplitButton } = await import("./ReplySplitButton");
const { DraftReplyCard } = await import("./DraftReplyCard");

interface Request {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}
const requests: Request[] = [];
const originalFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let generateFails = false;

beforeEach(() => {
  requests.length = 0;
  generateFails = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/api/, "");
    const method = init?.method ?? "GET";
    requests.push({
      method,
      path,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    if (path === "/accounts") return json({ accounts: [] });
    if (path.endsWith("/generate-reply")) {
      return generateFails
        ? json({ error: "hosted_api_error", message: "The vendor timed out" }, 502)
        : json({ subject: "Re: Lunch?", body: "Thursday works.", model: "m", runId: "r" });
    }
    if (path.endsWith("/send-reply"))
      return json({ ok: true, sentMessageId: "s", threadId: "th-1" });
    if (path.endsWith("/archive")) return json({ ok: true, threadId: "th-1" });
    throw new Error(`unexpected request: ${method} ${path}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const message = (over: Partial<MessageDetail> = {}) =>
  messageDetail({
    fromEmail: "claire@example.com",
    fromName: "Claire Martin",
    subject: "Lunch?",
    ...over,
  });

const renderReader = async (msg: MessageDetail) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ComposeProvider>
          <ReplySplitButton message={msg} />
          <DraftReplyCard message={msg} />
        </ComposeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await act(async () => {});
};

const openMenu = async () => {
  fireEvent.click(screen.getByRole("button", { name: "More ways to reply" }));
  await screen.findByRole("menuitem", { name: /Forward/ });
};

describe("the Reply split button", () => {
  test("its face opens a plain reply", async () => {
    await renderReader(message());
    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0]!);
    expect(screen.getByRole("region", { name: "Reply: Re: Lunch?" })).toBeDefined();
  });

  test("offers Reply all only when there is someone else to reach, counting everyone", async () => {
    await renderReader(message({ replyAllCc: ["samy@example.com", "nathalie@example.com"] }));
    await openMenu();
    expect(screen.getByRole("menuitem", { name: /Reply all · 3 people/ })).toBeDefined();
  });

  test("leaves Reply all out of a one-to-one message", async () => {
    await renderReader(message({ replyAllCc: [] }));
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: /Reply all/ })).toBeNull();
  });

  test("R, A and F open their window; a key typed into a field does not", async () => {
    await renderReader(message({ replyAllCc: ["samy@example.com"] }));

    fireEvent.keyDown(window, { key: "f" });
    expect(screen.getByRole("region", { name: "Forward: Fwd: Lunch?" })).toBeDefined();

    // Typing an "a" into the forward's To field is a letter, not Reply all.
    fireEvent.keyDown(screen.getByLabelText("To"), { key: "a" });
    expect(screen.queryByRole("region", { name: /^Reply all/ })).toBeNull();

    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByRole("region", { name: "Reply all: Re: Lunch?" })).toBeDefined();
  });

  test("⇧R opens a reply with the caret in the AI strip", async () => {
    await renderReader(message());
    fireEvent.keyDown(window, { key: "R", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText("Instruction for the AI"));
  });
});

describe("the draft card", () => {
  test("drafts nothing until asked", async () => {
    await renderReader(message());
    expect(requests.some((r) => r.path.endsWith("/generate-reply"))).toBe(false);
    expect(screen.getByRole("button", { name: /Draft with AI/ })).toBeDefined();
  });

  test("Draft with AI shows the draft; Send & archive sends it then archives", async () => {
    await renderReader(message());
    fireEvent.click(screen.getByRole("button", { name: /Draft with AI/ }));

    await screen.findByText("Thursday works.");
    const card = screen.getByRole("region", { name: "Draft reply" });

    fireEvent.click(within(card).getByRole("button", { name: /Send & archive/ }));
    await waitFor(() => expect(screen.getByText("Reply sent")).toBeDefined());
    expect(screen.getByText(/· archived$/)).toBeDefined();
    const writes = requests.filter((r) => r.method === "POST").map((r) => r.path);
    expect(writes).toEqual([
      "/messages/acc-1/msg-1/generate-reply",
      "/messages/acc-1/msg-1/send-reply",
      "/messages/acc-1/msg-1/archive",
    ]);
    expect(requests.find((r) => r.path.endsWith("/send-reply"))!.body).toEqual({
      subject: "Re: Lunch?",
      body: "Thursday works.",
    });
  });

  test("Edit hands the draft to a reply window", async () => {
    await renderReader(message());
    fireEvent.click(screen.getByRole("button", { name: /Draft with AI/ }));
    await screen.findByText("Thursday works.");
    const card = screen.getByRole("region", { name: "Draft reply" });
    fireEvent.click(within(card).getByRole("button", { name: /Edit/ }));

    const win = screen.getByRole("region", { name: "Reply: Re: Lunch?" });
    expect((within(win).getByLabelText("Message body") as HTMLTextAreaElement).value).toBe(
      "Thursday works.",
    );
  });

  test("a failed draft says why and offers a retry", async () => {
    generateFails = true;
    await renderReader(message());
    fireEvent.click(screen.getByRole("button", { name: /Draft with AI/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("The vendor timed out"),
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });
});
