// The sync period is the period on screen, and there is no second way to say it
// (#153). #152 made the pager the only source; this is the guard that the
// modules expressing a *different* period are gone rather than merely unwired —
// an unimported component is invisible in the app and one import away from
// being back, and the three that were left each fetched a window the user was
// not looking at.
//
// Scanned as source on purpose: what is asserted is the absence of a module,
// which no render reaches. The behaviour these deletions must not disturb is
// rendered next door, in syncPeriodWiring.test.tsx.
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const webSrc = resolve(import.meta.dir, "../..");

/** This file names what it forbids, so it cannot be scanned for it. */
const SELF = "features/sync/syncPeriodRemoved.test.ts";

const SOURCES = [...new Glob("**/*.{ts,tsx}").scanSync(webSrc)]
  .map((path) => path.replaceAll("\\", "/"))
  .filter((path) => path !== SELF);

const isTest = (path: string) => path.includes(".test.");
const read = (path: string) => readFileSync(join(webSrc, path), "utf8");

describe("the retired sync-period modules", () => {
  /**
   * The split button's second half and the popover behind it went with #152;
   * the hook that persisted the choice and the range controls that predated the
   * whole thing are this issue's.
   */
  const RETIRED = ["SyncSplitButton", "SyncPeriodPopover", "useSyncPeriod", "SyncRangeControls"];

  test.each(RETIRED)("%s has no module left", (name) => {
    expect(SOURCES.filter((path) => path.includes(name))).toEqual([]);
  });

  test.each(RETIRED)("%s is named by nothing", (name) => {
    expect(SOURCES.filter((path) => read(path).includes(name))).toEqual([]);
  });
});

describe("the abandoned storage key", () => {
  const KEY = "miel.sync.period";

  /**
   * A returning browser still holds one. Nothing may consult it, so the only
   * file allowed to name the key is the suite that seeds a stale value to prove
   * it changes no request — this is the same claim for the corners a render
   * does not reach.
   */
  test("only the suite that proves it inert names it", () => {
    expect(SOURCES.filter((path) => read(path).includes(KEY))).toEqual([
      "features/sync/syncPeriodWiring.test.tsx",
    ]);
  });
});

describe("what starts a sync", () => {
  /**
   * Every module that opens the sync socket, which is the set that can ask for
   * a period. Matched on the import rather than the name, so a comment
   * mentioning the hook is not mistaken for a caller.
   */
  const STARTERS = SOURCES.filter(
    (path) => !isTest(path) && /import\s*\{[^}]*\buseSyncStream\b/.test(read(path)),
  );

  /**
   * Listed rather than counted: a fourth way to start a sync is a period
   * decision, and it should arrive with someone looking at this list.
   */
  test("they are the button and the focus refresh, and nothing else", () => {
    expect(STARTERS.toSorted()).toEqual([
      "components/topbar/SyncActions.tsx",
      "features/sync/useFocusSync.ts",
    ]);
  });

  /**
   * `since` is the preset window the popover spoke in — "7d", "30d" — and it is
   * how a caller expresses a period of its own. A gesture-started sync names an
   * explicit `range` instead, derived from the pager at the press, so the
   * request and the list on screen cannot disagree.
   */
  test.each(STARTERS)("%s asks for a range, not a preset window", (path) => {
    const source = read(path);
    expect(source).toContain("range:");
    expect(source).not.toContain("since:");
  });
});
