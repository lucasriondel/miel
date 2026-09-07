import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MessageDetail } from "../../api/types";

// Reply as a floating, collapsible window (#96), exercised the way a user meets
// it: press a pill, read the fields, type, minimize, restore, generate, send.
//
// Rendered rather than matched against source — a window that "has a To field"
// in its markup and loses what was typed in it on minimize would satisfy a
// regex and fail the acceptance criteria.

interface Sent {
  path: string;
  method?: string;
  body: Record<string, unknown>;
}

const sent: Sent[] = [];
const DRAFT = { subject: "Re: Lunch?", body: "Sounds good — Thursday works.", model: "a-model" };
let sendFails = false;

/**
 * The mock's own `ApiError`, because that is the class `apiErrorMessage` will
 * narrow against once the module is replaced: a refused send has to reach the
 * user as the sentence beside the code (#130).
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

/**
 * The one seam stubbed: the api client, which is where a generate or a send
 * would leave the process. Registered in the file body with the subject
 * imported after it, for the reason `gateSteps.test.tsx` gives — a bun module
 * mock is process-global, so a suite that registers none gets whichever one ran
 * last. Anything the window is not seeded for is refused, so a stray request
 * fails the test rather than resolving to a silent `{}`.
 */
mock.module("../../api/client", () => ({
  ApiError,
  apiFetch: async (req: Sent) => {
    sent.push({ path: req.path, method: req.method, body: req.body });
    if (req.path.endsWith("/generate-reply")) return { ...DRAFT, runId: "run-1" };
    if (req.path.endsWith("/send-reply")) {
      if (sendFails) throw new ApiError("gmail_error", 502, { message: "Gmail said no" });
      return { ok: true, sentMessageId: "18f2ab" };
    }
    throw new Error(`unexpected request: ${req.path}`);
  },
}));

const { ReplyComposer } = await import("./ReplyComposer");

const MESSAGE = {
  accountId: "acc-1",
  accountEmail: "you@example.com",
  gmailMessageId: "msg-1",
  fromEmail: "sender@example.com",
  subject: "Lunch?",
} as MessageDetail;

beforeEach(() => {
  sent.length = 0;
  sendFails = false;
});

const renderComposer = (openSignal = 0) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <ReplyComposer message={MESSAGE} openSignal={openSignal} />
    </QueryClientProvider>,
  );

const windowRegion = () => screen.queryByRole("region", { name: /^Reply/ });
const openWindow = () => fireEvent.click(screen.getByRole("button", { name: /^Reply$/ }));
const field = (name: string) => screen.getByLabelText<HTMLInputElement>(name);
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });

const generateDraft = async (instruction = "Accept for Thursday") => {
  type("Instruction for the AI", instruction);
  fireEvent.click(screen.getByRole("button", { name: /Generate/ }));
  await waitFor(() => expect(field("Body").value).toBe(DRAFT.body));
};

describe("opening the window", () => {
  test("the page holds pills and no window until one is pressed", () => {
    renderComposer();

    expect(screen.getByRole("button", { name: /^Reply$/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Draft with AI/ })).toBeDefined();
    expect(windowRegion()).toBeNull();

    openWindow();

    expect(windowRegion()).not.toBeNull();
  });

  // "Floats over page content instead of occupying page flow" — the criterion
  // is positional, so it is the one thing here asserted as a class.
  test("floats, docked to the bottom right, above the page and under a modal", () => {
    renderComposer();
    openWindow();

    const dock = windowRegion()!.parentElement!;
    expect(dock.className).toContain("fixed");
    expect(dock.className).toContain("bottom-0");
    expect(dock.className).toContain("justify-end");
    // Popovers sit at z-[70] and modals at z-[100]; the window belongs between.
    expect(dock.className).toContain("z-[80]");
  });

  test("names itself after the subject being answered", () => {
    renderComposer();
    openWindow();

    expect(within(windowRegion()!).getByText("Lunch?")).toBeDefined();
  });

  test("prefills To with the sender and Subject with Re:, and leaves Cc empty", () => {
    renderComposer();
    openWindow();

    expect(field("To").value).toBe("sender@example.com");
    expect(field("Cc").value).toBe("");
    expect(field("Subject").value).toBe("Re: Lunch?");
    expect(field("Body").value).toBe("");
  });

  test("carries the AI half over: instruction, Generate and Discard", () => {
    renderComposer();
    openWindow();

    const win = within(windowRegion()!);
    expect(win.getByLabelText("Instruction for the AI")).toBeDefined();
    expect(win.getByRole("button", { name: /Generate/ })).toBeDefined();
    expect(win.getByRole("button", { name: "Discard" })).toBeDefined();
    expect(win.getByRole("button", { name: "Send" })).toBeDefined();
  });

  test("the top bar's Reply button opens the same window", () => {
    const view = renderComposer(0);
    expect(windowRegion()).toBeNull();

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ReplyComposer message={MESSAGE} openSignal={1} />
      </QueryClientProvider>,
    );

    expect(windowRegion()).not.toBeNull();
  });
});

describe("minimizing", () => {
  test("collapses to the title bar and back without losing a keystroke", () => {
    renderComposer();
    openWindow();
    type("Body", "half a sentence");
    type("Cc", "watcher@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));

    // Still there, still named — but the fields are gone with it.
    expect(windowRegion()).not.toBeNull();
    expect(within(windowRegion()!).getByText("Lunch?")).toBeDefined();
    expect(screen.queryByLabelText("Body")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(field("Body").value).toBe("half a sentence");
    expect(field("Cc").value).toBe("watcher@example.com");
  });

  // #91's non-negotiable, carried into #96: a minimized window holding a draft
  // is not a closed one, and nothing may reopen it behind the user's back.
  test("a minimized window stays minimized while it holds unsent text", () => {
    renderComposer();
    openWindow();
    type("Body", "unsent");

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));

    expect(screen.queryByLabelText("Body")).toBeNull();
    expect(screen.getByRole("button", { name: "Restore" })).toBeDefined();
  });
});

describe("generating, editing and sending", () => {
  test("generate fills Subject and Body from the AI's draft", async () => {
    renderComposer();
    openWindow();

    await generateDraft();

    expect(field("Subject").value).toBe("Re: Lunch?");
    expect(sent.map((r) => r.path)).toEqual(["/messages/acc-1/msg-1/generate-reply"]);
    expect(sent[0]!.body).toEqual({ prompt: "Accept for Thursday" });
    // A second run replaces what is on screen, so the action says so.
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeDefined();
  });

  test("send posts the edited recipients, subject and body", async () => {
    renderComposer();
    openWindow();
    await generateDraft();

    type("To", "someone@else.test, second@else.test");
    type("Cc", "watcher@example.com");
    type("Subject", "Re: Lunch? (Thursday)");
    type("Body", "Thursday it is.");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]!.path).toBe("/messages/acc-1/msg-1/send-reply");
    expect(sent[1]!.method).toBe("POST");
    expect(sent[1]!.body).toEqual({
      subject: "Re: Lunch? (Thursday)",
      body: "Thursday it is.",
      to: ["someone@else.test", "second@else.test"],
      cc: ["watcher@example.com"],
    });
  });

  test("a reply sent without touching the fields still names the sender", async () => {
    renderComposer();
    openWindow();
    type("Body", "Sure.");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body.to).toEqual(["sender@example.com"]);
    expect(sent[0]!.body.cc).toBeUndefined();
  });

  test("shows the sent confirmation, and does not offer to send it twice", async () => {
    renderComposer();
    openWindow();
    type("Body", "Sure.");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/18f2ab/)).toBeDefined());
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  test("surfaces a send failure instead of swallowing it", async () => {
    sendFails = true;
    renderComposer();
    openWindow();
    type("Body", "Sure.");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/Send failed/)).toBeDefined());
    expect(screen.getByRole("button", { name: "Send" })).toBeDefined();
  });

  test("refuses to send with no recipient, and warns about a finished non-address", () => {
    renderComposer();
    openWindow();
    type("Body", "Sure.");

    type("To", "");
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);

    type("To", "not-an-address,");
    expect(screen.getByText(/not-an-address/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("closing", () => {
  test("Discard puts the page back to its pills and forgets the draft", async () => {
    renderComposer();
    openWindow();
    await generateDraft();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(windowRegion()).toBeNull();
    expect(screen.getByRole("button", { name: /Draft with AI/ })).toBeDefined();

    openWindow();
    expect(field("Body").value).toBe("");
    expect(field("Subject").value).toBe("Re: Lunch?");
  });

  test("the title bar's close is the same discard", () => {
    renderComposer();
    openWindow();
    type("Body", "unsent");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(windowRegion()).toBeNull();
  });
});
