import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// #94. Archive and trash from the detail page used to `navigate("/")`, which
// threw away the account, the label, the view and the range — everything the
// inbox keeps in its URL — and dropped the user on the default account. Back
// and the confirmation-code delete already went through history and were fine.
//
// The fix was one exit for all four. What that leaves worth guarding is the
// *set*: this is the one test that names all four together, so wiring a fifth
// way off the page — or quietly reverting one of these — fails here rather
// than in whichever single-file test happens to cover it.
//
// #145 moved when three of them fire, not which exit they take: the two
// mutations no longer wait for their answer, so the exit is called from the
// click handler beside `mutate` rather than handed to it as an `onSuccess`.
// What each one *does* on screen is rendered in
// `features/message-detail/detailActions.test.tsx`; the set is still counted
// here, because no render reaches a fifth exit somebody adds later.

const web = join(import.meta.dir, "..", "..");
const read = (...parts: string[]) => readFileSync(join(web, ...parts), "utf8");

const detailPage = read("pages", "MessageDetailPage.tsx");
const messageActions = read("components", "MessageActions.tsx");

describe("the four ways off a message", () => {
  test("Back returns instead of pushing an inbox URL", () => {
    expect(detailPage).toContain("useReturnToInbox");
    expect(detailPage).toMatch(/onClick=\{returnToInbox\}/);
  });

  test("the confirmation-code delete returns as the trash is fired, not after", () => {
    expect(detailPage).toMatch(/trash\.mutate\([\s\S]{0,200}\);\s*returnToInbox\(\);/);
  });

  test("archive and trash leave by that same exit, not to the root", () => {
    expect(messageActions).toMatch(/archive\.mutate\(input\);\s*leaveDetail\?\.\(\)/);
    expect(messageActions).toMatch(/trash\.mutate\(input\);\s*leaveDetail\?\.\(\)/);
    expect(messageActions).toContain("useReturnToInbox");
  });

  // A mutate callback is dropped once the component that passed it unmounts,
  // and these two always unmount — so no exit may hang anything off the answer.
  test("none of the four waits for the request to land", () => {
    for (const source of [detailPage, messageActions]) {
      expect(source).not.toMatch(/onSuccess:\s*returnToInbox/);
    }
  });

  test("only the detail variant navigates — a row must stay put", () => {
    expect(messageActions).toMatch(/variant === "detail"\s*\?[\s\S]{0,80}: undefined/);
  });
});

/**
 * Every file that is only ever mounted on the message-detail page. The topbar
 * folder is deliberately excluded past the detail-only back button: the inbox
 * shares it, and switching accounts from there *is* a navigation to an inbox.
 */
const surfaceFiles = (): Array<[string, string]> => {
  const dir = join(web, "features", "message-detail");
  const detailOnly = readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
    .map(
      (f) =>
        [`features/message-detail/${f}`, readFileSync(join(dir, f), "utf8")] as [string, string],
    );
  return [
    ["pages/MessageDetailPage.tsx", detailPage],
    ["components/MessageActions.tsx", messageActions],
    [
      "components/topbar/BackToInboxButton.tsx",
      read("components", "topbar", "BackToInboxButton.tsx"),
    ],
    ...detailOnly,
  ];
};

/**
 * In-app route literals in a source file: `"/…"` strings and `` `/…` ``
 * templates, with each `${…}` collapsed to a `:param` segment so a built path
 * can be compared by shape. Import specifiers start with `.` or `@`, and links
 * out to Gmail are absolute, so neither is caught by the leading slash.
 */
const routeLiterals = (source: string): string[] =>
  [...source.matchAll(/["'`](\/[^"'`\n]*)["'`]/g)].map(([, path]) =>
    path!.replaceAll(/\$\{[^}]*\}/g, ":param"),
  );

/** The root, or an account with nothing after it — i.e. an inbox. */
const isInboxShaped = (path: string) => path === "/" || /^\/account\/[^/]+$/.test(path);

describe("the message-detail surface", () => {
  test("hard-navigates to an inbox from nowhere — that is the exit's job", () => {
    const offenders = surfaceFiles().flatMap(([name, source]) =>
      routeLiterals(source)
        .filter(isInboxShaped)
        .map((path) => `${name}: ${path}`),
    );

    // A navigation built here would be a second exit, and a second exit is
    // what dropped the filters: it can only rebuild a URL, never restore the
    // history entry the offset is saved against.
    expect(offenders).toEqual([]);
  });

  test("still allows a route that isn't an inbox — Filters, from the toast", () => {
    // Guards the check above from being vacuous: it must be discriminating,
    // not merely finding no route literals at all.
    expect(routeLiterals(messageActions)).toContain("/account/:param/filters");
  });
});
