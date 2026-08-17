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

const web = join(import.meta.dir, "..", "..");
const read = (...parts: string[]) => readFileSync(join(web, ...parts), "utf8");

const detailPage = read("pages", "MessageDetailPage.tsx");
const messageActions = read("components", "MessageActions.tsx");

describe("the four ways off a message", () => {
  test("Back returns instead of pushing an inbox URL", () => {
    expect(detailPage).toContain("useReturnToInbox");
    expect(detailPage).toMatch(/onClick=\{returnToInbox\}/);
  });

  test("the confirmation-code delete returns once the trash lands", () => {
    expect(detailPage).toMatch(/trash\.mutate\([\s\S]{0,200}onSuccess:\s*returnToInbox/);
  });

  test("archive and trash return by that same exit, not to the root", () => {
    expect(messageActions).toMatch(/onSuccess:\s*returnToInbox/);
    expect(messageActions).toMatch(/archive\.mutate\(input,\s*returnToInboxOnSuccess\)/);
    expect(messageActions).toMatch(/trash\.mutate\(input,\s*returnToInboxOnSuccess\)/);
  });

  test("only the detail variant navigates — a row must stay put", () => {
    expect(messageActions).toMatch(/variant === "detail"\s*\?[\s\S]{0,80}: undefined/);
  });
});

/**
 * Every file that is only ever mounted on the message-detail page. The topbar
 * folder is deliberately excluded past the two detail-only islands: the inbox
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
    [
      "components/topbar/MessageActionsIsland.tsx",
      read("components", "topbar", "MessageActionsIsland.tsx"),
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
