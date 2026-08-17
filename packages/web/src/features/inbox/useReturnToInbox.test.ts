import { describe, expect, test } from "bun:test";
import { navigateToInbox, type InboxNavigate } from "./useReturnToInbox";

// #94. All four ways off a message — Back, the confirmation panel's delete,
// and the top bar's archive and trash — go through one exit. `inboxReturnTarget`
// decides *where* that exit lands; this is the other half, which turns the
// decision into the navigation itself. It is the part that has to get `-1` and
// `replace` right, and the part a source grep can't check.
//
// Extracted from the hook so it can be exercised without a DOM render — the
// same seam `trashMessageMutationOptions` uses in `api/mutations.ts`.

type Call = [number] | [string, { replace: boolean }];

const exitFrom = (input: {
  locationKey: string;
  accountId: string | undefined;
  search: string;
}): Call[] => {
  const calls: Call[] = [];
  const navigate: InboxNavigate = (to: number | string, options?: { replace: boolean }) => {
    calls.push(options === undefined ? [to as number] : [to as string, options]);
  };
  navigateToInbox(navigate, input);
  return calls;
};

describe("leaving a message from inside the app", () => {
  // The entry behind the message is the inbox the user opened it from: its
  // account, its label, its period, and the scroll offset saved against that
  // entry's key. Only going back restores all four — rebuilding the URL would
  // push a second entry and restore none of the scroll.
  test("goes back to the inbox entry rather than rebuilding a URL", () => {
    expect(
      exitFrom({
        locationKey: "b7x2k1",
        accountId: "acc-1",
        search: "?view=month&range=2026-08&label=Label_5",
      }),
    ).toEqual([[-1]]);
  });

  test("navigates exactly once — an archive must not walk history twice", () => {
    expect(exitFrom({ locationKey: "b7x2k1", accountId: "acc-1", search: "" })).toHaveLength(1);
  });
});

describe("leaving a message that was opened cold", () => {
  // `default` is the key react-router gives the first entry of a session: a
  // deep link, a new tab, or a reload on the message itself. Nothing to go
  // back to, so the inbox is rebuilt from the scope the URL is carrying.
  test("rebuilds the filtered inbox, not the default account or the root", () => {
    expect(
      exitFrom({
        locationKey: "default",
        accountId: "acc-1",
        search: "?view=month&range=2026-08&label=Label_5",
      }),
    ).toEqual([["/account/acc-1?view=month&range=2026-08&label=Label_5", { replace: true }]]);
  });

  // The message is gone (archived, trashed) or being left; a Back that returned
  // to it would show a trashed message or a 404.
  test("replaces the message entry instead of pushing past it", () => {
    const [call] = exitFrom({
      locationKey: "default",
      accountId: "acc-1",
      search: "",
    });

    expect(call).toEqual(["/account/acc-1", { replace: true }]);
  });

  test("drops params the inbox's scope isn't made of", () => {
    // A connect outcome riding back would re-toast "Connected …" on arrival.
    expect(
      exitFrom({
        locationKey: "default",
        accountId: "acc-1",
        search: "?connected=a%40example.com&view=all",
      }),
    ).toEqual([["/account/acc-1?view=all", { replace: true }]]);
  });
});
