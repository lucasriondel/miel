import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #95. The detail variant's archive and trash used to `navigate("/")`, which
// throws away the inbox the user came from: its account, its filters, its
// scroll offset, and the history entry holding all three. Both now leave
// through `useReturnToInbox`, the same path the Back button and the
// confirmation panel take.
//
// Source assertions: this package has no DOM harness, and what has to stay
// true is which navigation the mutations hang off. The decision itself is
// covered in `features/inbox/inboxLocation.test.ts`.
const source = readFileSync(join(import.meta.dir, "MessageActions.tsx"), "utf8");

describe("the detail variant's post-action navigation", () => {
  test("returns to the inbox instead of hard-navigating to the root", () => {
    expect(source).not.toMatch(/navigate\(\s*["'`]\/["'`]\s*\)/);
    expect(source).toContain("useReturnToInbox");
  });

  test("hangs the return off the mutation's success, not the click", () => {
    expect(source).toMatch(/onSuccess:\s*returnToInbox/);
  });

  test("leaves the row variant where it is — a list must not navigate", () => {
    expect(source).toMatch(/variant === "detail"\s*\?[\s\S]{0,80}: undefined/);
  });
});
