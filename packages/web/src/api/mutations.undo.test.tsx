/**
 * Archive and trash announce themselves with an Undo (Main view › Toasts:
 * "Archived · Undo", "Moved to trash · Undo"), and the Undo is the matching
 * route read backwards. Rendered through the app's own toaster, with `fetch`
 * stubbed, so what is asserted is the button a user sees and the request it
 * sends.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { MielToaster } from "../components/MielToaster";
import {
  archiveMessageMutationOptions,
  batchMessageActionMutationOptions,
  trashMessageMutationOptions,
} from "./mutations";

const originalFetch = globalThis.fetch;
const API = `${window.location.origin}/api`;

const stubFetch = () => {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify({ ok: true, threadId: "th-1", count: 2 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const INPUT = { accountId: "acc-1", gmailMessageId: "msg-1" };

describe("the Undo on a removal", () => {
  test("an archive offers Undo, and Undo unarchives the same message", async () => {
    const calls = stubFetch();
    render(<MielToaster />);
    archiveMessageMutationOptions(new QueryClient()).onSuccess(
      { ok: true, threadId: "th-1" },
      INPUT,
    );

    expect(await screen.findByText("Archived")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        `POST ${API}/messages/acc-1/msg-1/unarchive`,
      ]),
    );
  });

  test("a trash offers Undo, and Undo untrashes the same message", async () => {
    const calls = stubFetch();
    render(<MielToaster />);
    trashMessageMutationOptions(new QueryClient()).onSuccess({ ok: true, threadId: "th-1" }, INPUT);

    expect(await screen.findByText("Moved to trash")).toBeDefined();
    fireEvent.click(screen.getAllByRole("button", { name: "Undo" }).at(-1)!);

    await waitFor(() =>
      expect(calls.map((c) => `${c.method} ${c.url}`)).toContain(
        `POST ${API}/messages/acc-1/msg-1/untrash`,
      ),
    );
  });

  test("a section's bulk archive is undone as one batch of the same messages", async () => {
    const calls = stubFetch();
    render(<MielToaster />);
    batchMessageActionMutationOptions(new QueryClient()).onSuccess(
      { ok: true, action: "archive", count: 2 },
      { accountId: "acc-1", gmailMessageIds: ["a", "b"], action: "archive" },
    );

    expect(await screen.findByText("2 messages archived")).toBeDefined();
    fireEvent.click(screen.getAllByRole("button", { name: "Undo" }).at(-1)!);

    await waitFor(() =>
      expect(calls.at(-1)).toEqual({
        url: `${API}/messages/batch`,
        method: "POST",
        body: { accountId: "acc-1", gmailMessageIds: ["a", "b"], action: "unarchive" },
      }),
    );
  });
});
