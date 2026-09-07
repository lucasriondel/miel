// Asking one message for its promo codes, from the message page (#165).
//
// The sync extracts as it fetches — only from what it just brought in, and only
// from the mails a content prefilter thought worth a model call. This panel is
// the other door, so what is asserted here is the door: the button is there
// before anything has been found, the answer lands where the question was
// asked, and an empty answer says so rather than looking like a button that
// did nothing.
//
// Rendered into the DOM harness (#129) with `apiFetch` stubbed in this file's
// own body — a module mock is process-global, so a suite that registers none
// gets whichever one ran last. Anything unseeded is refused: every render here
// is seeded, so a stray request is a bug and not a fixture.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PromoSuggestion } from "../../api/types";

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

let requests: Array<{ path: string; method: string }> = [];
/** What the next extraction answers — a result, or an error to raise. */
let answer: { promos: PromoSuggestion[]; found: boolean } | ApiError;
/**
 * Held open by the one test that asserts the in-flight state, and resolved
 * before it ends. A gate inside the single stub, rather than a second
 * `mock.module` for that test: a module mock is process-global and registering
 * one mid-file replaces the client for every test after it too.
 */
let gate: Promise<void> | null = null;

mock.module("../../api/client", () => ({
  ApiError,
  apiFetch: async (req: { path: string; method?: string }) => {
    requests.push({ path: req.path, method: req.method ?? "GET" });
    if (!req.path.endsWith("/extract-promos")) {
      throw new ApiError(`unexpected request: ${req.path}`, 500, null);
    }
    if (gate) await gate;
    if (answer instanceof ApiError) throw answer;
    return answer;
  },
}));

const { PromoCodePanel } = await import("./PromoCodePanel");
const { MielToaster } = await import("../../components/MielToaster");
const { messageDetail } = await import("../../api/messageDetail.fixture");

const promo = (over: Partial<PromoSuggestion> = {}): PromoSuggestion => ({
  id: "promo-1",
  accountId: "acc-1",
  gmailMessageId: "msg-1",
  code: "WEEKEND20",
  discount: "20% off everything",
  terms: "orders over £50",
  expiresAt: "2026-09-06T23:59:59.999Z",
  merchant: "Zara",
  ...over,
});

const renderPanel = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      {/* Mounted because one path here raises a toast: a refusal is the only
          thing that tells the presser why nothing came back. `sonner` is
          deliberately not mocked — a module mock is process-global, and faking
          it here would swallow every other suite's toasts too. */}
      <MielToaster />
      <PromoCodePanel message={messageDetail()} />
    </QueryClientProvider>,
  );
};

const findButton = () => screen.getByRole("button", { name: /Find promo codes|Search again/ });

beforeEach(() => {
  requests = [];
  gate = null;
  answer = { promos: [], found: false };
});

afterEach(() => {
  // The clipboard is this suite's only global, and only the copy test sets it.
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("the promo codes panel", () => {
  test("offers the search before anything has been found", () => {
    renderPanel();

    // Unlike the verification panel beside it, which appears only once it has
    // news: a panel that hid itself until it had something could never be asked.
    expect(screen.getByText("Promo Codes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find promo codes" })).toBeTruthy();
    expect(requests).toEqual([]);
  });

  test("asks this message's own endpoint, and shows what came back", async () => {
    answer = { promos: [promo()], found: true };
    renderPanel();

    fireEvent.click(findButton());

    await screen.findByText("20% off everything");
    expect(requests).toEqual([{ path: "/messages/acc-1/msg-1/extract-promos", method: "POST" }]);
    expect(screen.getByText("orders over £50")).toBeTruthy();
    expect(screen.getByText(/Zara/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy code" }).textContent).toContain("WEEKEND20");
  });

  test("says so when the mail holds no codes", async () => {
    answer = { promos: [], found: false };
    renderPanel();

    fireEvent.click(findButton());

    // The answer nobody would otherwise see: an empty result and a button that
    // did nothing are the same picture without this.
    await screen.findByText("No promo codes found in this email.");
    expect(screen.getByRole("button", { name: "Search again" })).toBeTruthy();
  });

  test("an offer with no code is shown, with nothing to copy", async () => {
    answer = { promos: [promo({ code: null, discount: "Free shipping" })], found: true };
    renderPanel();

    fireEvent.click(findButton());

    await screen.findByText("Free shipping");
    expect(screen.getByText("No code needed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
  });

  test("states a promo's deadline as a date, read in UTC", async () => {
    answer = { promos: [promo()], found: true };
    renderPanel();

    fireEvent.click(findButton());

    // The stored instant is the end of the promo's last UTC day, so the label
    // must not drift a day east of Greenwich. The month's spelling is the
    // runner's locale and none of this suite's business — the *day* is.
    await screen.findByText(/Expires \D*6\D+2026/);
  });

  test("names no deadline when the mail stated none", async () => {
    answer = { promos: [promo({ expiresAt: null })], found: true };
    renderPanel();

    fireEvent.click(findButton());

    await screen.findByText(/No end date/);
  });

  test("the code copies to the clipboard", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    answer = { promos: [promo()], found: true };
    renderPanel();
    fireEvent.click(findButton());

    fireEvent.click(await screen.findByRole("button", { name: "Copy code" }));

    await waitFor(() => expect(written).toEqual(["WEEKEND20"]));
    // Copying changes nothing on the server — no request follows it.
    expect(requests).toHaveLength(1);
  });

  test("the button is disabled while the model is being asked", async () => {
    let release: (() => void) | undefined;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    answer = { promos: [promo()], found: true };
    renderPanel();

    fireEvent.click(findButton());

    // Found by its text rather than its accessible name: while the spinner is
    // up it contributes its own "Loading" label to the button's name.
    await waitFor(() => {
      const button = screen.getByText("Searching…").closest("button");
      expect(button?.hasAttribute("disabled")).toBe(true);
    });
    release?.();
    await screen.findByText("20% off everything");
  });

  test("a refusal is reported and leaves the panel askable", async () => {
    answer = new ApiError("claude_unavailable", 503, { error: "claude_unavailable" });
    renderPanel();

    fireEvent.click(findButton());

    expect(await screen.findByText(/Could not extract promo codes/)).not.toBeNull();
    // Nothing was found, so the panel still says what it said, and can be asked
    // again once the credential is in place.
    expect(screen.getByRole("button", { name: "Find promo codes" })).toBeTruthy();
  });
});
