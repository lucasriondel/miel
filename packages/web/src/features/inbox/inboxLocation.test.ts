import { describe, expect, test } from "bun:test";
import { inboxPath, inboxSearch, inboxReturnTarget, messageDetailPath } from "./inboxLocation";

// #95. The inbox keeps its whole scope in the query string — `view`, `range`
// and `label` — and `useDateRange` re-derives from the URL on every render, so
// a URL without them *is* a reset inbox. These functions are the one place
// that decides which params travel with a navigation and which don't.

describe("inboxSearch", () => {
  test("keeps only the params the inbox's scope is made of", () => {
    expect(inboxSearch("?view=month&range=2026-08&label=Label_5")).toBe(
      "?view=month&range=2026-08&label=Label_5",
    );
  });

  test("drops everything else — a connect outcome must not ride along", () => {
    // Carrying `connected` into the detail URL would re-toast "Connected …"
    // on arrival, and again on the way back (see useConnectResult).
    expect(inboxSearch("?connected=a%40example.com&view=all")).toBe("?view=all");
    expect(inboxSearch("?connect_error=denied")).toBe("");
  });

  test("is empty for an inbox at its defaults", () => {
    expect(inboxSearch("")).toBe("");
    expect(inboxSearch("?")).toBe("");
  });

  test("keeps a canonical order, whatever order the URL had", () => {
    expect(inboxSearch("?label=Label_5&range=2026-W32&view=week")).toBe(
      "?view=week&range=2026-W32&label=Label_5",
    );
  });

  test("preserves values that need encoding", () => {
    expect(inboxSearch("?label=CATEGORY%2FSocial")).toBe("?label=CATEGORY%2FSocial");
  });
});

describe("messageDetailPath", () => {
  test("carries the inbox's scope onto the message it opens", () => {
    expect(messageDetailPath("acc-1", "msg-1", "?view=month&range=2026-08")).toBe(
      "/account/acc-1/messages/msg-1?view=month&range=2026-08",
    );
  });

  test("leaves the path bare when the inbox is at its defaults", () => {
    expect(messageDetailPath("acc-1", "msg-1", "")).toBe("/account/acc-1/messages/msg-1");
  });
});

describe("inboxPath", () => {
  test("is the account's inbox, with the scope restored", () => {
    expect(inboxPath("acc-1", "?view=all")).toBe("/account/acc-1?view=all");
  });

  test("falls back to the root when there is no account to return to", () => {
    expect(inboxPath(undefined, "?view=all")).toBe("/?view=all");
  });
});

describe("inboxReturnTarget", () => {
  test("goes back when this page was opened from inside the app", () => {
    // The previous history entry *is* the inbox, filters, scroll and all —
    // rebuilding a URL instead would push a second entry and lose the offset.
    expect(
      inboxReturnTarget({
        locationKey: "b7x2k1",
        accountId: "acc-1",
        search: "?view=month",
      }),
    ).toEqual({ kind: "back" });
  });

  test("rebuilds the inbox URL when there is nothing to go back to", () => {
    // `default` is the key react-router gives the first entry of a session:
    // a deep link, a new tab, or a reload on the message itself.
    expect(
      inboxReturnTarget({
        locationKey: "default",
        accountId: "acc-1",
        search: "?view=month&range=2026-08",
      }),
    ).toEqual({ kind: "to", to: "/account/acc-1?view=month&range=2026-08" });
  });

  test("still leaves the message when the deep link carried no scope", () => {
    expect(inboxReturnTarget({ locationKey: "default", accountId: "acc-1", search: "" })).toEqual({
      kind: "to",
      to: "/account/acc-1",
    });
  });
});
